"""Batch ingestion and remediation export endpoints."""

from __future__ import annotations

import csv
import hashlib
import io
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.batch import SubmissionBatch, ValidationResult
from app.models.enums import BatchStatus, InstitutionStatus, ValidationSeverity, ValidationStatus
from app.models.institutional import Institution
from app.models.supporting import User
from app.services.validation.engine import ValidationEngine

router = APIRouter(prefix="/api/batches", tags=["batches"])


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_batch(
    file: Annotated[UploadFile, File(...)],
    institution_id: Annotated[uuid.UUID | None, Form()] = None,
    uploaded_by: Annotated[uuid.UUID | None, Form()] = None,
    db: Session = Depends(get_db),
) -> dict:
    """Accepts an RFC-4180 CSV file upload, evaluates regulatory rules,

    saves batch metadata and validation line items, and promotes passing rows.
    """
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be an RFC-4180 compliant .csv file.",
        )

    # 1. Resolve institution_id
    if institution_id is None:
        inst = db.scalar(select(Institution).where(Institution.status == InstitutionStatus.active))
        if inst is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active institution found in database. Please provide a valid institution_id.",
            )
        institution_id = inst.id
    else:
        inst = db.get(Institution, institution_id)
        if inst is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Institution with id '{institution_id}' not found.",
            )

    # 2. Resolve uploaded_by user
    if uploaded_by is None:
        user = db.scalar(select(User))
        if user is None:
            user = User(id=uuid.uuid4())
            db.add(user)
            db.flush()
        uploaded_by = user.id
    else:
        user = db.get(User, uploaded_by)
        if user is None:
            user = User(id=uploaded_by)
            db.add(user)
            db.flush()

    # 3. Read content and compute hash
    content_bytes = await file.read()
    file_sha256 = hashlib.sha256(content_bytes).hexdigest()
    csv_text = content_bytes.decode("utf-8-sig", errors="replace")

    batch_id = uuid.uuid4()

    # 4. Save upload to disk for later annotated remediation export
    upload_file_path = settings.uploads_path / f"{batch_id}.csv"
    with open(upload_file_path, "wb") as f:
        f.write(content_bytes)

    # 5. Create SubmissionBatch record
    batch = SubmissionBatch(
        id=batch_id,
        institution_id=institution_id,
        uploaded_by=uploaded_by,
        original_filename=file.filename,
        file_sha256=file_sha256,
        total_rows=0,
        accepted_rows=0,
        flagged_rows=0,
        rejected_rows=0,
        status=BatchStatus.validating,
    )
    db.add(batch)
    db.flush()

    # 6. Run validation engine
    engine = ValidationEngine(session=db, institution_id=institution_id)
    summary = engine.validate_csv_content(csv_text)

    # 7. Check if header level violation occurred
    if summary.header_violation:
        db.add(
            ValidationResult(
                batch_id=batch.id,
                row_index=0,
                rule_code=summary.header_violation.rule_code,
                severity=summary.header_violation.severity,
                status=summary.header_violation.status,
                rule_description=summary.header_violation.rule_description,
                evidence_payload=summary.header_violation.evidence_payload,
                remediation_hint=summary.header_violation.remediation_hint,
            )
        )
        batch.status = BatchStatus.failed
        db.commit()

        return {
            "batch_id": str(batch.id),
            "status": batch.status.value,
            "original_filename": batch.original_filename,
            "file_sha256": batch.file_sha256,
            "total_rows": 0,
            "accepted_rows": 0,
            "flagged_rows": 0,
            "rejected_rows": 0,
            "error": summary.header_violation.rule_description,
        }

    # 8. Persist validation results and promote passing rows
    for validated_row in summary.validated_rows:
        for violation in validated_row.violations:
            db.add(
                ValidationResult(
                    batch_id=batch.id,
                    row_index=validated_row.row_index,
                    rule_code=violation.rule_code,
                    severity=violation.severity,
                    status=violation.status,
                    rule_description=violation.rule_description,
                    evidence_payload=violation.evidence_payload,
                    remediation_hint=violation.remediation_hint,
                )
            )

        if validated_row.status in (ValidationStatus.accepted, ValidationStatus.flagged):
            engine.promote_row_to_admission(validated_row)

    # 9. Update batch metadata and finalize
    batch.total_rows = summary.total_rows
    batch.accepted_rows = summary.accepted_rows
    batch.flagged_rows = summary.flagged_rows
    batch.rejected_rows = summary.rejected_rows
    batch.status = BatchStatus.completed
    db.commit()

    return {
        "batch_id": str(batch.id),
        "status": batch.status.value,
        "original_filename": batch.original_filename,
        "file_sha256": batch.file_sha256,
        "total_rows": batch.total_rows,
        "accepted_rows": batch.accepted_rows,
        "flagged_rows": batch.flagged_rows,
        "rejected_rows": batch.rejected_rows,
    }


@router.get("/{id}/annotated-csv")
def download_annotated_csv(
    id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Response:
    """Generates and downloads the original CSV with appended diagnostic columns:

    AICTE_STATUS, ERROR_CODE, and REMEDIATION_HINT.
    """
    batch = db.get(SubmissionBatch, id)
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Batch with id '{id}' not found.",
        )

    # Locate the saved original CSV
    upload_file_path = settings.uploads_path / f"{batch.id}.csv"
    if not upload_file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Original CSV source file for this batch is not available.",
        )

    with open(upload_file_path, "r", encoding="utf-8-sig", errors="replace") as f:
        csv_text = f.read()

    # Query all validation results for this batch
    results_stmt = (
        select(ValidationResult)
        .where(ValidationResult.batch_id == batch.id)
        .order_by(ValidationResult.row_index, ValidationResult.rule_code)
    )
    all_results = db.scalars(results_stmt).all()

    # Group results by row_index
    results_by_row: dict[int, list[ValidationResult]] = {}
    for r in all_results:
        results_by_row.setdefault(r.row_index, []).append(r)

    reader = csv.reader(io.StringIO(csv_text))
    try:
        raw_headers = next(reader)
    except StopIteration:
        raw_headers = []

    annotated_headers = list(raw_headers) + ["AICTE_STATUS", "ERROR_CODE", "REMEDIATION_HINT"]

    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(annotated_headers)

    for row_index, row_cols in enumerate(reader, start=1):
        row_violations = results_by_row.get(row_index, [])

        blocking = [r for r in row_violations if r.severity == ValidationSeverity.blocking]
        warnings = [r for r in row_violations if r.severity == ValidationSeverity.warning]

        if blocking:
            status_str = "REJECTED"
            error_code = "; ".join(r.rule_code for r in blocking)
            remediation = "; ".join(r.remediation_hint for r in blocking)
        elif warnings:
            status_str = "FLAGGED"
            error_code = "; ".join(r.rule_code for r in warnings)
            remediation = "; ".join(r.remediation_hint for r in warnings)
        else:
            status_str = "ACCEPTED"
            error_code = ""
            remediation = ""

        writer.writerow(list(row_cols) + [status_str, error_code, remediation])

    annotated_content = output.getvalue()
    export_filename = f"annotated_{batch.original_filename}"

    return Response(
        content=annotated_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{export_filename}"',
            "Content-Type": "text/csv; charset=utf-8",
        },
    )


@router.get("/template")
def download_template() -> Response:
    """Download standard compliant AICTE CSV template v2026.1."""
    content = "apaar_id,full_name,gender,programme_code,academic_year,admission_category,start_date,end_date\r\n"
    return Response(
        content=content,
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="template_v2026.csv"',
            "Content-Type": "text/csv; charset=utf-8",
        },
    )


@router.get("/{id}")
def get_batch(
    id: uuid.UUID,
    db: Session = Depends(get_db),
) -> dict:
    """Get batch summary and line-item details for Screen S-03 review console."""
    batch = db.get(SubmissionBatch, id)
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Batch with id '{id}' not found.",
        )

    # Fetch validation results
    results_stmt = (
        select(ValidationResult)
        .where(ValidationResult.batch_id == batch.id)
        .order_by(ValidationResult.row_index, ValidationResult.rule_code)
    )
    all_results = db.scalars(results_stmt).all()
    results_by_row: dict[int, list[dict]] = {}
    for r in all_results:
        results_by_row.setdefault(r.row_index, []).append(
            {
                "rule_code": r.rule_code,
                "severity": r.severity.value,
                "status": r.status.value,
                "rule_description": r.rule_description,
                "evidence_payload": r.evidence_payload,
                "remediation_hint": r.remediation_hint,
            }
        )

    items: list[dict] = []
    upload_file_path = settings.uploads_path / f"{batch.id}.csv"
    if upload_file_path.exists():
        with open(upload_file_path, "r", encoding="utf-8-sig", errors="replace") as f:
            reader = csv.reader(f)
            raw_headers = next(reader, [])
            headers = [h.strip().lower() for h in raw_headers]
            for row_idx, row_cols in enumerate(reader, start=1):
                row_dict = {
                    headers[i]: (row_cols[i].strip() if i < len(row_cols) else "")
                    for i in range(len(headers))
                }
                violations = results_by_row.get(row_idx, [])
                has_blocking = any(v["severity"] == "blocking" for v in violations)
                has_warning = any(v["severity"] == "warning" for v in violations)
                if has_blocking:
                    row_status = "rejected"
                elif has_warning:
                    row_status = "flagged"
                else:
                    row_status = "accepted"

                items.append(
                    {
                        "row_index": row_idx,
                        "apaar_id": row_dict.get("apaar_id") or None,
                        "full_name": row_dict.get("full_name") or "",
                        "gender": row_dict.get("gender") or "",
                        "programme_code": row_dict.get("programme_code") or "",
                        "academic_year": row_dict.get("academic_year") or "",
                        "admission_category": row_dict.get("admission_category") or "",
                        "start_date": row_dict.get("start_date") or "",
                        "end_date": row_dict.get("end_date") or None,
                        "status": row_status,
                        "violations": violations,
                    }
                )

    return {
        "id": str(batch.id),
        "institution_id": str(batch.institution_id),
        "original_filename": batch.original_filename,
        "total_rows": batch.total_rows,
        "accepted_rows": batch.accepted_rows,
        "flagged_rows": batch.flagged_rows,
        "rejected_rows": batch.rejected_rows,
        "status": batch.status.value,
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
        "items": items,
    }

