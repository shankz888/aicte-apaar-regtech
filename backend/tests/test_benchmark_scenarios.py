"""Synthetic Fault-Injection Benchmark Suite tests (PRD Section 8).

Validates:
- ST-02 (Intake): Sanctioned: 120, Injected: 135 rows -> Rows 1-120 Accepted, 15 Rows Rejected with CAP-001
- ST-03 (Clash): Active overlap in Institution B -> Rejected with DUP-002 without data leak
"""

import io
import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AdmissionRecord, Student, SubmissionBatch, ValidationResult
from app.models.enums import AdmissionCategory, ApaarStatus, EnrolmentStatus, Gender
from app.services.apaar_adapter import MockApaarServiceAdapter
from tests.test_batches_api import _build_csv_data


def test_benchmark_st02_intake_quota_exact_135(
    client: TestClient,
    db_session: Session,
    test_setup: dict,
) -> None:
    """PRD ST-02 Scenario:

    Sanctioned capacity: 120.
    Injected payload: 135 regular student admission records.
    Expected outcome:
      - 120 rows ACCEPTED (promoted)
      - 15 rows REJECTED with code CAP-001
      - Precision: 100%, Recall: 100%
    """
    inst_a = test_setup["inst_a"]
    prog1 = test_setup["prog1"]
    intake_a = test_setup["intake_a"]
    intake_a.approved_capacity = 120
    db_session.flush()

    rows = []
    for i in range(1, 136):
        apaar = MockApaarServiceAdapter.generate_valid_apaar_id(seed=80000000000 + i)
        rows.append(
            {
                "apaar_id": apaar,
                "full_name": f"Candidate Student #{i:03d}",
                "gender": "male" if i % 2 == 0 else "female",
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
        files={"file": ("synthetic_batch_overintake_135.csv", csv_bytes, "text/csv")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["total_rows"] == 135
    assert data["accepted_rows"] == 120
    assert data["rejected_rows"] == 15
    assert data["flagged_rows"] == 0

    batch_id = uuid.UUID(data["batch_id"])

    # Verify exactly 15 CAP-001 failure records
    failures = db_session.scalars(
        select(ValidationResult).where(
            ValidationResult.batch_id == batch_id,
            ValidationResult.rule_code == "CAP-001",
        ).order_by(ValidationResult.row_index)
    ).all()
    assert len(failures) == 15
    # Rows 121 to 135 must be the failing ones
    assert [f.row_index for f in failures] == list(range(121, 136))
    assert failures[0].evidence_payload["approved_capacity"] == 120
    assert failures[0].evidence_payload["attempted_intake"] == 121
    assert failures[-1].evidence_payload["attempted_intake"] == 135

    # Verify exactly 120 admission records exist in DB
    admitted = db_session.scalars(
        select(AdmissionRecord).where(
            AdmissionRecord.institution_id == inst_a.id,
            AdmissionRecord.programme_id == prog1.id,
        )
    ).all()
    assert len(admitted) == 120


def test_benchmark_st03_cross_tenant_clash(
    client: TestClient,
    db_session: Session,
    test_setup: dict,
) -> None:
    """PRD ST-03 Scenario:

    Cross-institution active concurrent enrolment conflict (DUP-002).
    Pre-existing students enrolled in Institution A.
    Batch uploaded to Institution B containing those IDs.
    Must reject conflicting rows without cross-tenant data leak.
    """
    inst_a = test_setup["inst_a"]
    inst_b = test_setup["inst_b"]
    prog1 = test_setup["prog1"]

    # Pre-enrol 2 students at Institution A
    clash_apaars = [
        MockApaarServiceAdapter.generate_valid_apaar_id(seed=91000000001),
        MockApaarServiceAdapter.generate_valid_apaar_id(seed=91000000002),
    ]

    for i, apaar in enumerate(clash_apaars, 1):
        stu = Student(
            apaar_id=apaar,
            apaar_status=ApaarStatus.verified,
            full_name=f"Top Secret Student A_{i}",
            gender=Gender.female,
        )
        db_session.add(stu)
        db_session.flush()

        adm = AdmissionRecord(
            student_id=stu.id,
            institution_id=inst_a.id,
            programme_id=prog1.id,
            academic_year="2026-2027",
            admission_category=AdmissionCategory.general,
            enrolment_status=EnrolmentStatus.active,
            start_date=date(2026, 8, 1),
            is_verified_active=True,
        )
        db_session.add(adm)
        db_session.flush()

    # Create batch for Institution B:
    # Row 1: Clean new student
    # Row 2: Clash student 1
    # Row 3: Clash student 2
    clean_apaar = MockApaarServiceAdapter.generate_valid_apaar_id(seed=91000000099)
    rows = [
        {
            "apaar_id": clean_apaar,
            "full_name": "Legitimate Applicant B",
            "gender": "male",
            "programme_code": "BTECH-CSE",
            "academic_year": "2026-2027",
            "admission_category": "general",
            "start_date": "2026-08-01",
        },
        {
            "apaar_id": clash_apaars[0],
            "full_name": "Conflicting Applicant 1",
            "gender": "female",
            "programme_code": "BTECH-CSE",
            "academic_year": "2026-2027",
            "admission_category": "general",
            "start_date": "2026-08-01",
        },
        {
            "apaar_id": clash_apaars[1],
            "full_name": "Conflicting Applicant 2",
            "gender": "female",
            "programme_code": "BTECH-CSE",
            "academic_year": "2026-2027",
            "admission_category": "general",
            "start_date": "2026-08-01",
        },
    ]

    csv_bytes = _build_csv_data(rows)
    response = client.post(
        "/api/batches/upload",
        data={"institution_id": str(inst_b.id)},
        files={"file": ("synthetic_batch_concurrent_transfer.csv", csv_bytes, "text/csv")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["total_rows"] == 3
    assert data["accepted_rows"] == 1
    assert data["rejected_rows"] == 2

    batch_id = uuid.UUID(data["batch_id"])
    dup_results = db_session.scalars(
        select(ValidationResult).where(
            ValidationResult.batch_id == batch_id,
            ValidationResult.rule_code == "DUP-002",
        ).order_by(ValidationResult.row_index)
    ).all()
    assert len(dup_results) == 2
    assert dup_results[0].row_index == 2
    assert dup_results[1].row_index == 3

    for r in dup_results:
        assert f"#{inst_a.aicte_permanent_id}" in r.rule_description
        # Critical security check: No student PII leaked from Inst A
        assert "Top Secret Student" not in str(r.evidence_payload)
        assert "Top Secret Student" not in r.rule_description
