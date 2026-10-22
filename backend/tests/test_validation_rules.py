"""Unit tests for deterministic regulatory validation rules."""

import uuid
from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.models.enums import (
    AdmissionCategory,
    ApaarStatus,
    EnrolmentStatus,
    Gender,
    ValidationSeverity,
    ValidationStatus,
)
from app.models.student import AdmissionRecord, Student
from app.services.apaar_adapter import MockApaarServiceAdapter
from app.services.validation.rules import (
    MANDATORY_CSV_HEADERS,
    validate_apr_001,
    validate_apr_002,
    validate_cap_001,
    validate_cap_002,
    validate_dup_001,
    validate_dup_002,
    validate_sch_001_headers,
    validate_sch_001_row,
    validate_sch_002,
)


def test_sch_001_headers_validation() -> None:
    # All mandatory headers present
    valid_headers = list(MANDATORY_CSV_HEADERS) + ["extra_column"]
    assert validate_sch_001_headers(valid_headers) is None

    # Missing mandatory header 'academic_year'
    bad_headers = [h for h in MANDATORY_CSV_HEADERS if h != "academic_year"]
    violation = validate_sch_001_headers(bad_headers)
    assert violation is not None
    assert violation.rule_code == "SCH-001"
    assert violation.severity == ValidationSeverity.blocking
    assert violation.status == ValidationStatus.rejected
    assert "academic_year" in violation.evidence_payload["missing_headers"]


def test_sch_001_row_split_validation() -> None:
    assert validate_sch_001_row(7, 7) is None

    # Malformed row with unescaped comma split
    violation = validate_sch_001_row(8, 7, "a,b,c,d,e,f,g,h")
    assert violation is not None
    assert violation.rule_code == "SCH-001"
    assert violation.severity == ValidationSeverity.blocking
    assert violation.evidence_payload["expected_columns"] == 7
    assert violation.evidence_payload["found_columns"] == 8


def test_sch_002_academic_year_regex() -> None:
    # Valid formats
    assert validate_sch_002("2025-2026") is None
    assert validate_sch_002("2026-2027") is None

    # Invalid formats
    for invalid in ["2025/2026", "2025-26", "25-26", "2025", "invalid", "", None]:
        violation = validate_sch_002(invalid)
        assert violation is not None
        assert violation.rule_code == "SCH-002"
        assert violation.severity == ValidationSeverity.blocking
        assert violation.status == ValidationStatus.rejected


def test_apr_001_voluntary_missing_apaar() -> None:
    # Missing or empty APAAR triggers warning
    for empty in [None, "", "   "]:
        violation = validate_apr_001(empty)
        assert violation is not None
        assert violation.rule_code == "APR-001"
        assert violation.severity == ValidationSeverity.warning
        assert violation.status == ValidationStatus.flagged
        assert violation.evidence_payload["status"] == "pending_apaar"

    # Present APAAR passes APR-001
    assert validate_apr_001("123456789010") is None


def test_apr_002_checksum_verification() -> None:
    adapter = MockApaarServiceAdapter()
    valid_id = adapter.generate_valid_apaar_id(seed=98765432101)

    # Valid APAAR passes
    assert validate_apr_002(valid_id, adapter=adapter) is None

    # Tampered checksum triggers APR-002
    tampered = valid_id[:-1] + ("0" if valid_id[-1] != "0" else "1")
    violation = validate_apr_002(tampered, adapter=adapter)
    assert violation is not None
    assert violation.rule_code == "APR-002"
    assert violation.severity == ValidationSeverity.blocking
    assert violation.status == ValidationStatus.rejected
    assert violation.evidence_payload["reason"] == "checksum_failed"

    # Invalid length triggers APR-002
    violation_len = validate_apr_002("12345", adapter=adapter)
    assert violation_len is not None
    assert violation_len.rule_code == "APR-002"
    assert violation_len.evidence_payload["reason"] == "invalid_format_must_be_12_digits"


def test_dup_001_batch_duplicate_detection() -> None:
    seen: dict[str, int] = {}
    key1 = "apaar:123456789010"

    # First occurrence passes
    assert validate_dup_001(key1, seen, current_row_index=1) is None
    seen[key1] = 1

    # Second occurrence in same batch triggers DUP-001
    violation = validate_dup_001(key1, seen, current_row_index=5)
    assert violation is not None
    assert violation.rule_code == "DUP-001"
    assert violation.severity == ValidationSeverity.blocking
    assert violation.status == ValidationStatus.rejected
    assert violation.evidence_payload["first_seen_row"] == 1
    assert violation.evidence_payload["current_row"] == 5


def test_dup_002_cross_institution_active_conflict(
    db_session: Session,
    test_setup: dict,
) -> None:
    """Verifies DUP-002 fires accurately when a student has active enrolment

    at another institution, while concealing private personal details.
    """
    inst_a = test_setup["inst_a"]
    inst_b = test_setup["inst_b"]
    prog1 = test_setup["prog1"]

    apaar_id = MockApaarServiceAdapter.generate_valid_apaar_id(seed=11112222333)

    # Student actively enrolled at Institution A
    student = Student(
        apaar_id=apaar_id,
        apaar_status=ApaarStatus.verified,
        full_name="Confidential Student Name",
        gender=Gender.female,
    )
    db_session.add(student)
    db_session.flush()

    enrolment_a = AdmissionRecord(
        student_id=student.id,
        institution_id=inst_a.id,
        programme_id=prog1.id,
        academic_year="2026-2027",
        admission_category=AdmissionCategory.general,
        enrolment_status=EnrolmentStatus.active,
        start_date=date(2026, 8, 1),
        is_verified_active=True,
    )
    db_session.add(enrolment_a)
    db_session.flush()

    # Case 1: Uploading for Institution B with the same APAAR ID triggers DUP-002
    violation = validate_dup_002(
        apaar_id=apaar_id,
        current_institution_id=inst_b.id,
        session=db_session,
    )
    assert violation is not None
    assert violation.rule_code == "DUP-002"
    assert violation.severity == ValidationSeverity.blocking
    assert violation.status == ValidationStatus.rejected
    assert f"#{inst_a.aicte_permanent_id}" in violation.rule_description

    # Privacy check: Ensure student's personal identifying information is NOT leaked
    assert "Confidential Student Name" not in str(violation.evidence_payload)
    assert "Confidential Student Name" not in violation.rule_description
    assert violation.evidence_payload["conflicting_institution_code"] == inst_a.aicte_permanent_id
    assert violation.evidence_payload["enrolment_status"] == "active"

    # Case 2: Same institution upload (re-enrolment / internal validation) does NOT trigger DUP-002
    assert validate_dup_002(apaar_id, inst_a.id, db_session) is None

    # Case 3: If student's enrolment at Institution A is no longer active (e.g. withdrawn / transferred),
    # DUP-002 must NOT block
    enrolment_a.enrolment_status = EnrolmentStatus.withdrawn
    db_session.flush()
    assert validate_dup_002(apaar_id, inst_b.id, db_session) is None


def test_cap_001_approved_intake_quota_overrun() -> None:
    """Verifies CAP-001 boundary behavior against approved capacity."""
    capacity = 120
    prog_code = "BTECH-CSE"
    year = "2026-2027"

    # Within capacity (record 1..120) passes
    assert validate_cap_001(
        current_intake=120,
        approved_capacity=capacity,
        programme_code=prog_code,
        academic_year=year,
    ) is None

    # 121st student exceeds capacity of 120 -> fires CAP-001
    violation = validate_cap_001(
        current_intake=121,
        approved_capacity=capacity,
        programme_code=prog_code,
        academic_year=year,
    )
    assert violation is not None
    assert violation.rule_code == "CAP-001"
    assert violation.severity == ValidationSeverity.blocking
    assert violation.status == ValidationStatus.rejected
    assert violation.evidence_payload["approved_capacity"] == 120
    assert violation.evidence_payload["attempted_intake"] == 121
    assert violation.evidence_payload["programme_code"] == "BTECH-CSE"
    assert violation.evidence_payload["academic_year"] == "2026-2027"


def test_cap_002_nri_supernumerary_quota_breach() -> None:
    """Verifies CAP-002 boundary behavior against sanctioned NRI supernumerary cap."""
    nri_cap = 18
    prog_code = "BTECH-CSE"
    year = "2026-2027"

    # Within NRI cap passes
    assert validate_cap_002(
        current_nri_intake=18,
        supernumerary_nri_cap=nri_cap,
        programme_code=prog_code,
        academic_year=year,
    ) is None

    # 19th NRI applicant exceeds cap of 18 -> fires CAP-002
    violation = validate_cap_002(
        current_nri_intake=19,
        supernumerary_nri_cap=nri_cap,
        programme_code=prog_code,
        academic_year=year,
    )
    assert violation is not None
    assert violation.rule_code == "CAP-002"
    assert violation.severity == ValidationSeverity.blocking
    assert violation.status == ValidationStatus.rejected
    assert violation.evidence_payload["supernumerary_nri_cap"] == 18
    assert violation.evidence_payload["attempted_nri_intake"] == 19
