r"""Deterministic regulatory validation rules for student admission records.

Implements rules:
- SCH-001 (Missing mandatory headers / malformed row splits)
- SCH-002 (Academic year format: regex ^\d{4}-\d{4}$)
- APR-001 (Voluntary missing APAAR flagged as warning 'pending_apaar')
- APR-002 (Checksum check via a mock APAAR service adapter)
- DUP-001 (Duplicate row or identifier in current batch)
- DUP-002 (Cross-institution active concurrent enrolment conflict)
- CAP-001 (Approved intake quota overrun against approved_intakes capacity)
- CAP-002 (Supernumerary NRI quota breach)
"""

import re
import uuid
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import AdmissionCategory, EnrolmentStatus, ValidationSeverity, ValidationStatus
from app.models.institutional import Institution
from app.models.student import AdmissionRecord, Student
from app.services.apaar_adapter import MockApaarServiceAdapter, apaar_adapter

MANDATORY_CSV_HEADERS: tuple[str, ...] = (
    "apaar_id",
    "full_name",
    "gender",
    "programme_code",
    "academic_year",
    "admission_category",
    "start_date",
)

ACADEMIC_YEAR_REGEX = re.compile(r"^\d{4}-\d{4}$")


@dataclass(frozen=True)
class RuleViolation:
    rule_code: str
    severity: ValidationSeverity
    status: ValidationStatus
    rule_description: str
    evidence_payload: dict[str, Any]
    remediation_hint: str


def validate_sch_001_headers(headers: Sequence[str]) -> RuleViolation | None:
    """SCH-001: Validate presence of mandatory CSV headers."""
    cleaned_headers = [h.strip().lower() for h in headers if h]
    header_set = set(cleaned_headers)
    missing = [m for m in MANDATORY_CSV_HEADERS if m not in header_set]
    if missing:
        return RuleViolation(
            rule_code="SCH-001",
            severity=ValidationSeverity.blocking,
            status=ValidationStatus.rejected,
            rule_description="Missing mandatory header or unescaped comma split.",
            evidence_payload={
                "missing_headers": missing,
                "provided_headers": list(headers),
                "expected_headers": list(MANDATORY_CSV_HEADERS),
            },
            remediation_hint="Align CSV against template v1.2 headers; re-save file as UTF-8 without BOM.",
        )
    return None


def validate_sch_001_row(row_length: int, expected_length: int, raw_line: str = "") -> RuleViolation | None:
    """SCH-001: Validate that row column count matches header column count."""
    if row_length != expected_length:
        return RuleViolation(
            rule_code="SCH-001",
            severity=ValidationSeverity.blocking,
            status=ValidationStatus.rejected,
            rule_description="Missing mandatory header or unescaped comma split.",
            evidence_payload={
                "expected_columns": expected_length,
                "found_columns": row_length,
                "raw_line": raw_line,
            },
            remediation_hint="Align CSV against template v1.2 headers; re-save file as UTF-8 without BOM.",
        )
    return None


def validate_sch_002(academic_year: str | None) -> RuleViolation | None:
    r"""SCH-002: Validate academic year format matches ^\d{4}-\d{4}$."""
    val = (academic_year or "").strip()
    if not ACADEMIC_YEAR_REGEX.match(val):
        return RuleViolation(
            rule_code="SCH-002",
            severity=ValidationSeverity.blocking,
            status=ValidationStatus.rejected,
            rule_description="Invalid academic year format (regex failed: ^\\d{4}-\\d{4}$).",
            evidence_payload={
                "academic_year": academic_year,
                "expected_pattern": "^\\d{4}-\\d{4}$",
            },
            remediation_hint="Ensure academic_year matches format 'YYYY-YYYY' (e.g., 2025-2026).",
        )
    return None


def validate_apr_001(apaar_id: str | None) -> RuleViolation | None:
    """APR-001: Flag voluntary missing APAAR as warning pending_apaar."""
    if not apaar_id or not str(apaar_id).strip():
        return RuleViolation(
            rule_code="APR-001",
            severity=ValidationSeverity.warning,
            status=ValidationStatus.flagged,
            rule_description="APAAR identifier missing or null.",
            evidence_payload={
                "field": "apaar_id",
                "status": "pending_apaar",
            },
            remediation_hint="Flag row as 'pending_apaar'. APAAR is voluntary; institutional intake proceeds.",
        )
    return None


def validate_apr_002(
    apaar_id: str | None,
    adapter: MockApaarServiceAdapter | None = None,
) -> RuleViolation | None:
    """APR-002: Checksum check via mock APAAR service adapter.

    Only executes when APAAR ID is present.
    """
    if not apaar_id or not str(apaar_id).strip():
        return None

    adapter = adapter or apaar_adapter
    valid, reason = adapter.validate_apaar(apaar_id)
    if not valid:
        return RuleViolation(
            rule_code="APR-002",
            severity=ValidationSeverity.blocking,
            status=ValidationStatus.rejected,
            rule_description="Checksum failed against mock registry verification endpoint.",
            evidence_payload={
                "apaar_id": apaar_id,
                "reason": reason,
            },
            remediation_hint="Verify APAAR string with student record. Resubmit with corrected 12-digit format.",
        )
    return None


def validate_dup_001(
    identifier_key: str,
    seen_identifiers: Mapping[str, int],
    current_row_index: int,
) -> RuleViolation | None:
    """DUP-001: Check for duplicate student identifier inside current batch."""
    if identifier_key in seen_identifiers:
        first_row = seen_identifiers[identifier_key]
        return RuleViolation(
            rule_code="DUP-001",
            severity=ValidationSeverity.blocking,
            status=ValidationStatus.rejected,
            rule_description="Same student identifier appears multiple times in current batch.",
            evidence_payload={
                "duplicate_identifier": identifier_key,
                "first_seen_row": first_row,
                "current_row": current_row_index,
            },
            remediation_hint="Remove redundant row inside current batch payload prior to resubmission.",
        )
    return None


def validate_dup_002(
    apaar_id: str | None,
    current_institution_id: uuid.UUID,
    session: Session,
) -> RuleViolation | None:
    """DUP-002: Cross-institution active concurrent enrolment conflict.

    Blocks record if APAAR matches an active enrolment at another institution,
    without leaking private student details from the conflicting institution.
    """
    if not apaar_id or not str(apaar_id).strip():
        return None

    cleaned_apaar = apaar_id.strip()

    # Query active admission records for any student with this APAAR ID at a different institution
    stmt = (
        select(AdmissionRecord, Institution.aicte_permanent_id)
        .join(Student, AdmissionRecord.student_id == Student.id)
        .join(Institution, AdmissionRecord.institution_id == Institution.id)
        .where(
            Student.apaar_id == cleaned_apaar,
            AdmissionRecord.institution_id != current_institution_id,
            AdmissionRecord.enrolment_status == EnrolmentStatus.active,
        )
    )

    conflict = session.execute(stmt).first()
    if conflict is not None:
        record, conflicting_inst_code = conflict
        return RuleViolation(
            rule_code="DUP-002",
            severity=ValidationSeverity.blocking,
            status=ValidationStatus.rejected,
            rule_description=(
                f"Concurrent Full-time Enrolment Active at Institute ID #{conflicting_inst_code}"
            ),
            evidence_payload={
                "conflicting_institution_code": conflicting_inst_code,
                "enrolment_status": "active",
            },
            remediation_hint="Verify transfer certificate. Submit NOC/clearance certificate to resolve dispute.",
        )
    return None


def validate_cap_001(
    current_intake: int,
    approved_capacity: int,
    programme_code: str,
    academic_year: str,
) -> RuleViolation | None:
    """CAP-001: Approved intake quota overrun against approved_intakes capacity.

    Applies to regular admissions (non-supernumerary).
    """
    if current_intake > approved_capacity:
        return RuleViolation(
            rule_code="CAP-001",
            severity=ValidationSeverity.blocking,
            status=ValidationStatus.rejected,
            rule_description=f"Sanctioned Intake Capacity Exceeded ({approved_capacity}): Found {current_intake} records",
            evidence_payload={
                "approved_capacity": approved_capacity,
                "attempted_intake": current_intake,
                "programme_code": programme_code,
                "academic_year": academic_year,
            },
            remediation_hint="Aggregate capacity breached. File AICTE variation request or adjust admissions.",
        )
    return None


def validate_cap_002(
    current_nri_intake: int,
    supernumerary_nri_cap: int,
    programme_code: str,
    academic_year: str,
) -> RuleViolation | None:
    """CAP-002: Supernumerary NRI quota breach."""
    if current_nri_intake > supernumerary_nri_cap:
        return RuleViolation(
            rule_code="CAP-002",
            severity=ValidationSeverity.blocking,
            status=ValidationStatus.rejected,
            rule_description=(
                f"Sanctioned NRI supernumerary cap exceeded ({supernumerary_nri_cap}): "
                f"Found {current_nri_intake} records"
            ),
            evidence_payload={
                "supernumerary_nri_cap": supernumerary_nri_cap,
                "attempted_nri_intake": current_nri_intake,
                "programme_code": programme_code,
                "academic_year": academic_year,
            },
            remediation_hint="Cap breached (>15% sanctioned quota). Audit applicant category allocations.",
        )
    return None
