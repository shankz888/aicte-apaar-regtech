"""End-to-End Automated Test for PRD Section 10 Demonstration Script (Steps 1 through 6)."""

import csv
import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import AdmissionCategory, ApaarStatus, EnrolmentStatus, Gender
from app.models.student import AdmissionRecord, Student


def test_hackathon_demo_script_steps_1_to_6_e2e(client: TestClient, db_session: Session, test_setup: dict):
    """Executes and validates the exact 6-step demonstration script from docs/PRD.md Section 10."""
    data_dir = Path(__file__).resolve().parent.parent / "data"
    inst_a_id = test_setup["inst_a"].id
    inst_b_id = test_setup["inst_b"].id
    prog1_id = test_setup["prog1"].id

    # Clean any prior admission records for inst_a in CSE to ensure pristine 120 capacity baseline
    db_session.query(AdmissionRecord).filter(
        AdmissionRecord.institution_id == inst_a_id,
        AdmissionRecord.programme_id == prog1_id,
    ).delete()
    db_session.flush()

    # -------------------------------------------------------------------------
    # STEP 1: The Ingestion Flow
    # Log in as Principal @ Apex Institute of Tech (inst_a_id).
    # Upload synthetic_batch_overintake_135.csv (sanctioned capacity: 120, rows: 135).
    # -------------------------------------------------------------------------
    overintake_path = data_dir / "synthetic_batch_overintake_135.csv"
    assert overintake_path.exists(), "synthetic_batch_overintake_135.csv must exist"

    with open(overintake_path, "rb") as f:
        file_bytes = f.read()

    upload_resp = client.post(
        "/api/batches/upload",
        data={"institution_id": str(inst_a_id)},
        files={"file": ("synthetic_batch_overintake_135.csv", file_bytes, "text/csv")},
    )
    assert upload_resp.status_code == 201
    batch_data = upload_resp.json()
    batch_id = batch_data["batch_id"]

    # -------------------------------------------------------------------------
    # STEP 2: Transparent Error Explanations
    # Rows 1-120 pass (ACCEPTED); rows 121-135 flag red (CAP-001 Intake Capacity Exceeded).
    # -------------------------------------------------------------------------
    assert batch_data["total_rows"] == 135
    assert batch_data["accepted_rows"] == 120
    assert batch_data["rejected_rows"] == 15
    assert batch_data["flagged_rows"] == 0

    # Inspect batch line items
    details_resp = client.get(f"/api/batches/{batch_id}")
    assert details_resp.status_code == 200
    details = details_resp.json()
    assert len(details["items"]) == 135

    # First 120 items are accepted
    for item in details["items"][:120]:
        assert item["status"] == "accepted"
        assert len(item["violations"]) == 0

    # Rows 121 to 135 are rejected with CAP-001
    for item in details["items"][120:]:
        assert item["status"] == "rejected"
        rule_codes = [v["rule_code"] for v in item["violations"]]
        assert "CAP-001" in rule_codes
        cap_v = next(v for v in item["violations"] if v["rule_code"] == "CAP-001")
        assert "Sanctioned Intake Capacity Exceeded" in cap_v["rule_description"]
        assert "evidence_payload" in cap_v

    # -------------------------------------------------------------------------
    # STEP 3: The Remediation Loop
    # Click "Download Annotated Error CSV". Preserves original columns and appends
    # AICTE_STATUS, ERROR_CODE, REMEDIATION_HINT.
    # -------------------------------------------------------------------------
    export_resp = client.get(f"/api/batches/{batch_id}/annotated-csv")
    assert export_resp.status_code == 200
    assert export_resp.headers["content-type"].startswith("text/csv")

    csv_reader = csv.reader(io.StringIO(export_resp.text))
    headers = next(csv_reader)
    assert "AICTE_STATUS" in headers
    assert "ERROR_CODE" in headers
    assert "REMEDIATION_HINT" in headers

    annotated_rows = list(csv_reader)
    assert len(annotated_rows) == 135
    # First row is ACCEPTED
    assert annotated_rows[0][-3] == "ACCEPTED"
    assert annotated_rows[0][-2] == ""
    # 121st row is REJECTED with CAP-001
    assert annotated_rows[120][-3] == "REJECTED"
    assert "CAP-001" in annotated_rows[120][-2]

    # -------------------------------------------------------------------------
    # STEP 4: Cross-Institutional Conflict Handling
    # Upload synthetic_batch_concurrent_transfer.csv.
    # Student 999988887777 is actively enrolled at Institution B (Karnataka State Eng College).
    # System blocks entry citing DUP-002 without leaking tenant secrets.
    # -------------------------------------------------------------------------
    concurrent_path = data_dir / "synthetic_batch_concurrent_transfer.csv"
    with open(concurrent_path, "r", encoding="utf-8") as f:
        c_reader = csv.reader(f)
        _ = next(c_reader)
        c_rows = list(c_reader)
    target_clash_apaar = c_rows[2][0]

    clash_student = db_session.scalar(select(Student).where(Student.apaar_id == target_clash_apaar))
    if clash_student is None:
        clash_student = Student(
            apaar_id=target_clash_apaar,
            apaar_status=ApaarStatus.verified,
            full_name="Rahul Verma",
            gender=Gender.male,
        )
        db_session.add(clash_student)
        db_session.flush()

    active_rec = db_session.scalar(
        select(AdmissionRecord).where(
            AdmissionRecord.student_id == clash_student.id,
            AdmissionRecord.institution_id == inst_b_id,
            AdmissionRecord.enrolment_status == EnrolmentStatus.active,
        )
    )
    if active_rec is None:
        active_rec = AdmissionRecord(
            student_id=clash_student.id,
            institution_id=inst_b_id,
            programme_id=prog1_id,
            academic_year="2026-2027",
            admission_category=AdmissionCategory.general,
            enrolment_status=EnrolmentStatus.active,
            start_date="2026-07-15",
            is_verified_active=True,
        )
        db_session.add(active_rec)
        db_session.flush()

    with open(concurrent_path, "rb") as f:
        concurrent_bytes = f.read()

    clash_resp = client.post(
        "/api/batches/upload",
        data={"institution_id": str(inst_a_id)},
        files={"file": ("synthetic_batch_concurrent_transfer.csv", concurrent_bytes, "text/csv")},
    )
    assert clash_resp.status_code == 201
    clash_batch = clash_resp.json()
    assert clash_batch["rejected_rows"] >= 1

    clash_details = client.get(f"/api/batches/{clash_batch['batch_id']}").json()
    clash_item = next(it for it in clash_details["items"] if it.get("apaar_id") == target_clash_apaar)
    assert clash_item["status"] == "rejected"
    dup_v = next(v for v in clash_item["violations"] if v["rule_code"] == "DUP-002")
    assert "Concurrent Full-time Enrolment Active at Institute ID" in dup_v["rule_description"]
    # Verify no private PII from institution B is disclosed
    assert "Karnataka" not in str(dup_v["evidence_payload"])
    assert "student_id" not in str(dup_v["evidence_payload"])

    # -------------------------------------------------------------------------
    # STEP 5: External Verification
    # Access token chk_demo8723. View verified academic status assertion.
    # APAAR ID and internal IDs completely redacted.
    # -------------------------------------------------------------------------
    verify_resp = client.get("/api/verify/chk_demo8723")
    assert verify_resp.status_code == 200
    v_data = verify_resp.json()
    assert v_data["status"] == "VERIFIED AICTE ENROLMENT"
    assert "assertion" in v_data
    assert "student_full_name" in v_data["assertion"]
    assert "cryptographic_proof" in v_data
    assert "verification_hash" in v_data["cryptographic_proof"]
    assert len(v_data["cryptographic_proof"]["verification_hash"]) == 64
    # Zero-knowledge check
    raw_text = verify_resp.text
    assert "apaar_id" not in raw_text
    assert "date_of_birth" not in raw_text
    assert "address" not in raw_text

    # -------------------------------------------------------------------------
    # STEP 6: Synthetic Benchmark Report
    # Review automated test matrix confirming 100% precision & recall.
    # -------------------------------------------------------------------------
    bench_resp = client.post("/api/benchmark/run-all")
    assert bench_resp.status_code == 200
    b_data = bench_resp.json()
    b_summary = b_data["summary"]
    assert b_summary["overall_status"] == "ALL PASSED"
    assert b_summary["macro_precision"] == 100.0
    assert b_summary["macro_recall"] == 100.0
    assert b_summary["macro_false_positive_rate"] == 0.0
    assert b_summary["throughput_records_per_sec"] > 0
    assert len(b_data["scenarios"]) == 4

    # Teardown test admission records
    db_session.query(AdmissionRecord).filter(
        AdmissionRecord.institution_id.in_([inst_a_id, inst_b_id])
    ).delete()
    db_session.flush()
