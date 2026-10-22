"""Integration tests for batch upload and annotated CSV remediation endpoints."""

import io
import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AdmissionRecord, ApprovedIntake, Student, SubmissionBatch, ValidationResult
from app.models.enums import AdmissionCategory, ApaarStatus, BatchStatus, EnrolmentStatus, Gender, IntakeStatus
from app.services.apaar_adapter import MockApaarServiceAdapter


def _build_csv_data(rows: list[dict[str, str]], headers: list[str] | None = None) -> bytes:
    """Helper to build UTF-8 encoded RFC-4180 CSV bytes."""
    import csv

    if headers is None:
        headers = [
            "apaar_id",
            "full_name",
            "gender",
            "programme_code",
            "academic_year",
            "admission_category",
            "start_date",
        ]
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow([row.get(h, "") for h in headers])
    return output.getvalue().encode("utf-8")


def test_batch_upload_clean(
    client: TestClient,
    db_session: Session,
    test_setup: dict,
) -> None:
    """Verifies a clean batch upload is accepted and records are promoted."""
    inst_a = test_setup["inst_a"]

    rows = []
    for i in range(1, 4):
        apaar = MockApaarServiceAdapter.generate_valid_apaar_id(seed=20000000000 + i)
        rows.append(
            {
                "apaar_id": apaar,
                "full_name": f"Student {i}",
                "gender": "female",
                "programme_code": "BTECH-CSE",
                "academic_year": "2026-2027",
                "admission_category": "general",
                "start_date": "2026-08-01",
            }
        )

    csv_bytes = _build_csv_data(rows)
    response = client.post(
        "/api/batches/upload",
        data={"institution_id": str(inst_a.id)},
        files={"file": ("clean_batch.csv", csv_bytes, "text/csv")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "completed"
    assert data["total_rows"] == 3
    assert data["accepted_rows"] == 3
    assert data["rejected_rows"] == 0
    assert data["flagged_rows"] == 0

    batch_id = uuid.UUID(data["batch_id"])
    batch = db_session.get(SubmissionBatch, batch_id)
    assert batch is not None
    assert batch.status == BatchStatus.completed
    assert batch.accepted_rows == 3

    # Check that students and admission records were created and promoted
    admissions = db_session.scalars(
        select(AdmissionRecord).where(AdmissionRecord.institution_id == inst_a.id)
    ).all()
    assert len(admissions) == 3
    for adm in admissions:
        assert adm.is_verified_active is True
        assert adm.enrolment_status == EnrolmentStatus.active


def test_cap_001_over_intake_boundary_api(
    client: TestClient,
    db_session: Session,
    test_setup: dict,
) -> None:
    """Verifies CAP-001 fires accurately in the ingestion API when capacity is exceeded.

    Intake capacity is set to 3. 5 rows are submitted.
    Rows 1-3 must be ACCEPTED; rows 4-5 must be REJECTED with CAP-001.
    """
    inst_a = test_setup["inst_a"]
    prog1 = test_setup["prog1"]

    # Set approved capacity to 3 for this test
    intake = test_setup["intake_a"]
    intake.approved_capacity = 3
    db_session.flush()

    rows = []
    for i in range(1, 6):
        apaar = MockApaarServiceAdapter.generate_valid_apaar_id(seed=30000000000 + i)
        rows.append(
            {
                "apaar_id": apaar,
                "full_name": f"Intake Student {i}",
                "gender": "male",
                "programme_code": "BTECH-CSE",
                "academic_year": "2026-2027",
                "admission_category": "general",
                "start_date": "2026-08-01",
            }
        )

    csv_bytes = _build_csv_data(rows)
    response = client.post(
        "/api/batches/upload",
        data={"institution_id": str(inst_a.id)},
        files={"file": ("over_intake_5_records.csv", csv_bytes, "text/csv")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "completed"
    assert data["total_rows"] == 5
    assert data["accepted_rows"] == 3
    assert data["rejected_rows"] == 2

    batch_id = uuid.UUID(data["batch_id"])

    # Check validation results: exactly 2 CAP-001 failures on row_index 4 and 5
    cap_failures = db_session.scalars(
        select(ValidationResult).where(
            ValidationResult.batch_id == batch_id,
            ValidationResult.rule_code == "CAP-001",
        ).order_by(ValidationResult.row_index)
    ).all()
    assert len(cap_failures) == 2
    assert cap_failures[0].row_index == 4
    assert cap_failures[0].evidence_payload["attempted_intake"] == 4
    assert cap_failures[0].evidence_payload["approved_capacity"] == 3
    assert cap_failures[1].row_index == 5
    assert cap_failures[1].evidence_payload["attempted_intake"] == 5

    # Check promoted admissions: exactly 3 admissions promoted
    promoted = db_session.scalars(
        select(AdmissionRecord).where(
            AdmissionRecord.institution_id == inst_a.id,
            AdmissionRecord.programme_id == prog1.id,
        )
    ).all()
    assert len(promoted) == 3


def test_dup_002_cross_institution_enrolment_conflict_api(
    client: TestClient,
    db_session: Session,
    test_setup: dict,
) -> None:
    """Verifies DUP-002 fires accurately in API when uploading a student with an active

    enrolment at another institution, without leaking the student's confidential info.
    """
    inst_a = test_setup["inst_a"]
    inst_b = test_setup["inst_b"]
    prog1 = test_setup["prog1"]

    apaar = MockApaarServiceAdapter.generate_valid_apaar_id(seed=40000000001)

    # Pre-enrol student actively at Institution A
    student = Student(
        apaar_id=apaar,
        apaar_status=ApaarStatus.verified,
        full_name="Secret Enrolled Student",
        gender=Gender.male,
    )
    db_session.add(student)
    db_session.flush()

    adm_a = AdmissionRecord(
        student_id=student.id,
        institution_id=inst_a.id,
        programme_id=prog1.id,
        academic_year="2026-2027",
        admission_category=AdmissionCategory.general,
        enrolment_status=EnrolmentStatus.active,
        start_date=date(2026, 8, 1),
        is_verified_active=True,
    )
    db_session.add(adm_a)
    db_session.flush()

    # Institution B attempts to upload this student
    rows = [
        {
            "apaar_id": apaar,
            "full_name": "Applicant In Conflict",
            "gender": "male",
            "programme_code": "BTECH-CSE",
            "academic_year": "2026-2027",
            "admission_category": "general",
            "start_date": "2026-08-01",
        }
    ]
    csv_bytes = _build_csv_data(rows)
    response = client.post(
        "/api/batches/upload",
        data={"institution_id": str(inst_b.id)},
        files={"file": ("conflict_transfer.csv", csv_bytes, "text/csv")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["rejected_rows"] == 1
    assert data["accepted_rows"] == 0

    batch_id = uuid.UUID(data["batch_id"])
    dup_res = db_session.scalar(
        select(ValidationResult).where(
            ValidationResult.batch_id == batch_id,
            ValidationResult.rule_code == "DUP-002",
        )
    )
    assert dup_res is not None
    assert dup_res.severity.value == "blocking"
    assert dup_res.status.value == "rejected"
    assert inst_a.aicte_permanent_id in dup_res.rule_description

    # Privacy verification: Secret student details are not present in evidence or error
    assert "Secret Enrolled Student" not in str(dup_res.evidence_payload)
    assert "Secret Enrolled Student" not in dup_res.rule_description


def test_voluntary_missing_apaar_promotes_with_warning(
    client: TestClient,
    db_session: Session,
    test_setup: dict,
) -> None:
    """Verifies APR-001 flags missing voluntary APAAR as warning and intake proceeds."""
    inst_a = test_setup["inst_a"]

    rows = [
        {
            "apaar_id": "",  # Voluntary empty APAAR
            "full_name": "Student Without APAAR",
            "gender": "female",
            "programme_code": "BTECH-CSE",
            "academic_year": "2026-2027",
            "admission_category": "general",
            "start_date": "2026-08-01",
        }
    ]
    csv_bytes = _build_csv_data(rows)
    response = client.post(
        "/api/batches/upload",
        data={"institution_id": str(inst_a.id)},
        files={"file": ("missing_apaar.csv", csv_bytes, "text/csv")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["total_rows"] == 1
    assert data["flagged_rows"] == 1
    assert data["rejected_rows"] == 0

    batch_id = uuid.UUID(data["batch_id"])
    res = db_session.scalar(
        select(ValidationResult).where(
            ValidationResult.batch_id == batch_id,
            ValidationResult.rule_code == "APR-001",
        )
    )
    assert res is not None
    assert res.severity.value == "warning"
    assert res.status.value == "flagged"

    # Verify intake proceeded and student created with pending_apaar
    student = db_session.scalar(
        select(Student).where(Student.full_name == "Student Without APAAR")
    )
    assert student is not None
    assert student.apaar_status == ApaarStatus.pending_apaar
    assert student.apaar_id is None

    # Admission record created
    adm = db_session.scalar(
        select(AdmissionRecord).where(AdmissionRecord.student_id == student.id)
    )
    assert adm is not None
    assert adm.enrolment_status == EnrolmentStatus.active


def test_annotated_csv_download(
    client: TestClient,
    db_session: Session,
    test_setup: dict,
) -> None:
    """Verifies GET /api/batches/{id}/annotated-csv preserves original columns

    and appends AICTE_STATUS, ERROR_CODE, and REMEDIATION_HINT.
    """
    import csv

    inst_a = test_setup["inst_a"]
    apaar_valid = MockApaarServiceAdapter.generate_valid_apaar_id(seed=50000000001)

    rows = [
        # Row 1: Valid (ACCEPTED)
        {
            "apaar_id": apaar_valid,
            "full_name": "Valid Student",
            "gender": "male",
            "programme_code": "BTECH-CSE",
            "academic_year": "2026-2027",
            "admission_category": "general",
            "start_date": "2026-08-01",
        },
        # Row 2: Missing voluntary APAAR (FLAGGED)
        {
            "apaar_id": "",
            "full_name": "No Apaar Student",
            "gender": "female",
            "programme_code": "BTECH-CSE",
            "academic_year": "2026-2027",
            "admission_category": "general",
            "start_date": "2026-08-01",
        },
        # Row 3: Bad academic year format (REJECTED with SCH-002)
        {
            "apaar_id": MockApaarServiceAdapter.generate_valid_apaar_id(seed=50000000003),
            "full_name": "Bad Year Student",
            "gender": "male",
            "programme_code": "BTECH-CSE",
            "academic_year": "2026/27",  # Invalid
            "admission_category": "general",
            "start_date": "2026-08-01",
        },
    ]

    csv_bytes = _build_csv_data(rows)
    upload_res = client.post(
        "/api/batches/upload",
        data={"institution_id": str(inst_a.id)},
        files={"file": ("test_annotated_source.csv", csv_bytes, "text/csv")},
    )
    assert upload_res.status_code == 201
    batch_id = upload_res.json()["batch_id"]

    # Request the annotated CSV
    download_res = client.get(f"/api/batches/{batch_id}/annotated-csv")
    assert download_res.status_code == 200
    assert "text/csv" in download_res.headers["content-type"]
    assert 'filename="annotated_test_annotated_source.csv"' in download_res.headers["content-disposition"]

    annotated_text = download_res.text
    reader = list(csv.reader(io.StringIO(annotated_text)))

    # Header check
    headers = reader[0]
    expected_appended = ["AICTE_STATUS", "ERROR_CODE", "REMEDIATION_HINT"]
    for col in expected_appended:
        assert col in headers

    # Row 1 (ACCEPTED)
    row1 = dict(zip(headers, reader[1]))
    assert row1["full_name"] == "Valid Student"
    assert row1["AICTE_STATUS"] == "ACCEPTED"
    assert row1["ERROR_CODE"] == ""
    assert row1["REMEDIATION_HINT"] == ""

    # Row 2 (FLAGGED)
    row2 = dict(zip(headers, reader[2]))
    assert row2["full_name"] == "No Apaar Student"
    assert row2["AICTE_STATUS"] == "FLAGGED"
    assert row2["ERROR_CODE"] == "APR-001"
    assert "pending_apaar" in row2["REMEDIATION_HINT"]

    # Row 3 (REJECTED)
    row3 = dict(zip(headers, reader[3]))
    assert row3["full_name"] == "Bad Year Student"
    assert row3["AICTE_STATUS"] == "REJECTED"
    assert row3["ERROR_CODE"] == "SCH-002"
    assert "YYYY-YYYY" in row3["REMEDIATION_HINT"]


def test_batch_upload_missing_headers_fails(
    client: TestClient,
    db_session: Session,
    test_setup: dict,
) -> None:
    """Verifies that uploading CSV with missing mandatory headers fails gracefully."""
    inst_a = test_setup["inst_a"]

    bad_csv = b"student_id,name,category\n1,Alice,general\n"
    response = client.post(
        "/api/batches/upload",
        data={"institution_id": str(inst_a.id)},
        files={"file": ("missing_headers.csv", bad_csv, "text/csv")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "failed"
    assert "Missing mandatory header" in data["error"]

    batch_id = uuid.UUID(data["batch_id"])
    result = db_session.scalar(
        select(ValidationResult).where(ValidationResult.batch_id == batch_id)
    )
    assert result is not None
    assert result.rule_code == "SCH-001"
    assert result.row_index == 0


def test_batch_upload_dup_001_in_batch(
    client: TestClient,
    db_session: Session,
    test_setup: dict,
) -> None:
    """Verifies DUP-001 fires in API when the same student appears twice in the same batch."""
    inst_a = test_setup["inst_a"]
    apaar = MockApaarServiceAdapter.generate_valid_apaar_id(seed=60000000001)

    rows = [
        {
            "apaar_id": apaar,
            "full_name": "Duplicate Student Entry 1",
            "gender": "male",
            "programme_code": "BTECH-CSE",
            "academic_year": "2026-2027",
            "admission_category": "general",
            "start_date": "2026-08-01",
        },
        {
            "apaar_id": apaar,
            "full_name": "Duplicate Student Entry 2",
            "gender": "male",
            "programme_code": "BTECH-CSE",
            "academic_year": "2026-2027",
            "admission_category": "general",
            "start_date": "2026-08-01",
        },
    ]

    csv_bytes = _build_csv_data(rows)
    response = client.post(
        "/api/batches/upload",
        data={"institution_id": str(inst_a.id)},
        files={"file": ("duplicate_batch.csv", csv_bytes, "text/csv")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["total_rows"] == 2
    assert data["accepted_rows"] == 1
    assert data["rejected_rows"] == 1

    batch_id = uuid.UUID(data["batch_id"])
    dup_res = db_session.scalar(
        select(ValidationResult).where(
            ValidationResult.batch_id == batch_id,
            ValidationResult.rule_code == "DUP-001",
        )
    )
    assert dup_res is not None
    assert dup_res.row_index == 2
    assert dup_res.evidence_payload["first_seen_row"] == 1
    assert dup_res.evidence_payload["current_row"] == 2


def test_cap_002_nri_supernumerary_quota_api(
    client: TestClient,
    db_session: Session,
    test_setup: dict,
) -> None:
    """Verifies CAP-002 fires in API when NRI supernumerary quota is exceeded."""
    inst_a = test_setup["inst_a"]
    intake = test_setup["intake_a"]
    intake.supernumerary_nri_cap = 2
    db_session.flush()

    rows = []
    for i in range(1, 4):
        apaar = MockApaarServiceAdapter.generate_valid_apaar_id(seed=70000000000 + i)
        rows.append(
            {
                "apaar_id": apaar,
                "full_name": f"NRI Student {i}",
                "gender": "female",
                "programme_code": "BTECH-CSE",
                "academic_year": "2026-2027",
                "admission_category": "nri",
                "start_date": "2026-08-01",
            }
        )

    csv_bytes = _build_csv_data(rows)
    response = client.post(
        "/api/batches/upload",
        data={"institution_id": str(inst_a.id)},
        files={"file": ("nri_quota_batch.csv", csv_bytes, "text/csv")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["total_rows"] == 3
    assert data["accepted_rows"] == 2
    assert data["rejected_rows"] == 1

    batch_id = uuid.UUID(data["batch_id"])
    cap2 = db_session.scalar(
        select(ValidationResult).where(
            ValidationResult.batch_id == batch_id,
            ValidationResult.rule_code == "CAP-002",
        )
    )
    assert cap2 is not None
    assert cap2.row_index == 3
    assert cap2.evidence_payload["supernumerary_nri_cap"] == 2
    assert cap2.evidence_payload["attempted_nri_intake"] == 3

