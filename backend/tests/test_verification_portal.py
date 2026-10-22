"""Tests for Zero-Knowledge Verification Gateway API and Protocol."""

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import AdmissionRecord, Student, VerificationToken
from app.models.enums import AdmissionCategory, ApaarStatus, EnrolmentStatus, Gender
from app.services.verification_service import (
    DEMO_TOKEN,
    compute_token_hash,
    issue_verification_token,
)


def test_verify_active_token_zero_knowledge(
    client: TestClient,
    db_session: Session,
    test_setup: dict,
) -> None:
    """Verifies that an active token returns permitted minimal disclosures

    and strictly redacts APAAR IDs, database IDs, and sensitive PII.
    """
    inst_a = test_setup["inst_a"]
    prog1 = test_setup["prog1"]

    student = Student(
        apaar_id="123456789099",
        apaar_status=ApaarStatus.verified,
        full_name="Rajesh Varma",
        gender=Gender.male,
    )
    db_session.add(student)
    db_session.flush()

    adm = AdmissionRecord(
        student_id=student.id,
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

    raw_token, token_obj = issue_verification_token(
        session=db_session,
        student_id=student.id,
        requester_org="Deloitte Verification Services",
        purpose="Employment Background Check",
        ttl_hours=72,
    )
    db_session.commit()

    # Call verification endpoint
    response = client.get(f"/api/verify/{raw_token}")
    assert response.status_code == 200
    data = response.json()

    assert data["valid"] is True
    assert data["status"] == "VERIFIED AICTE ENROLMENT"

    # Permitted Minimal Disclosures
    assertion = data["assertion"]
    assert assertion is not None
    assert assertion["student_full_name"] == "Rajesh Varma"
    assert assertion["institution_name"] == inst_a.legal_name
    assert assertion["programme_name"] == prog1.name
    assert assertion["academic_year"] == "2026-2027"
    assert "Active" in assertion["enrolment_status"]

    # Cryptographic Proof
    proof = data["cryptographic_proof"]
    assert proof is not None
    assert len(proof["verification_hash"]) == 64
    assert proof["token_hash"] == token_obj.token_hash
    assert proof["ttl_remaining_seconds"] > 0
    assert proof["requester_org"] == "Deloitte Verification Services"

    # STRICT ZERO-KNOWLEDGE PRIVACY CHECKS:
    # Ensure sensitive fields are NEVER leaked in the response payload
    raw_response_text = response.text
    assert "123456789099" not in raw_response_text  # NO APAAR ID
    assert str(student.id) not in raw_response_text  # NO student DB UUID
    assert str(adm.id) not in raw_response_text  # NO admission record UUID
    assert str(inst_a.id) not in raw_response_text  # NO institution UUID
    assert "male" not in raw_response_text.lower()  # NO gender
    assert "general" not in raw_response_text.lower()  # NO quota category


def test_verify_demo_token_chk_demo8723(client: TestClient) -> None:
    """Verifies that PRD Step 5 demo token chk_demo8723 resolves successfully."""
    response = client.get(f"/api/verify/{DEMO_TOKEN}")
    assert response.status_code == 200
    data = response.json()

    assert data["valid"] is True
    assert data["status"] == "VERIFIED AICTE ENROLMENT"
    assert data["assertion"]["student_full_name"] == "Aarav Sharma"
    assert "123456789010" not in response.text  # Still redacted


def test_verify_expired_token(
    client: TestClient,
    db_session: Session,
    test_setup: dict,
) -> None:
    """Verifies that expired tokens are cleanly rejected with EXPIRED status."""
    student = Student(
        apaar_id="999988887776",
        apaar_status=ApaarStatus.verified,
        full_name="Past Graduate",
        gender=Gender.female,
    )
    db_session.add(student)
    db_session.flush()

    raw_token = "tok_expired_sample_123"
    token_hash = compute_token_hash(raw_token)
    expired_time = datetime.now(timezone.utc) - timedelta(hours=10)

    token = VerificationToken(
        id=uuid.uuid4(),
        student_id=student.id,
        token_hash=token_hash,
        requester_org="Expired Requester",
        purpose="Old Verification",
        permitted_fields=["full_name"],
        expires_at=expired_time,
        revoked=False,
    )
    db_session.add(token)
    db_session.commit()

    response = client.get(f"/api/verify/{raw_token}")
    assert response.status_code == 200
    data = response.json()

    assert data["valid"] is False
    assert data["status"] == "EXPIRED"
    assert "expired" in data["reason"].lower()
    assert data["assertion"] is None


def test_verify_revoked_token(
    client: TestClient,
    db_session: Session,
    test_setup: dict,
) -> None:
    """Verifies that revoked tokens return REVOKED state."""
    student = Student(
        apaar_id="888877776665",
        apaar_status=ApaarStatus.verified,
        full_name="Revoked Student",
        gender=Gender.male,
    )
    db_session.add(student)
    db_session.flush()

    raw_token = "tok_revoked_sample_456"
    token_hash = compute_token_hash(raw_token)
    future_time = datetime.now(timezone.utc) + timedelta(hours=24)

    token = VerificationToken(
        id=uuid.uuid4(),
        student_id=student.id,
        token_hash=token_hash,
        requester_org="Screening Corp",
        purpose="Verification",
        permitted_fields=["full_name"],
        expires_at=future_time,
        revoked=True,
    )
    db_session.add(token)
    db_session.commit()

    response = client.get(f"/api/verify/{raw_token}")
    assert response.status_code == 200
    data = response.json()

    assert data["valid"] is False
    assert data["status"] == "REVOKED"
    assert "revoked" in data["reason"].lower()
    assert data["assertion"] is None


def test_verify_nonexistent_token(client: TestClient) -> None:
    """Verifies that non-existent tokens return UNABLE_TO_VERIFY."""
    response = client.get("/api/verify/unknown_token_99999")
    assert response.status_code == 200
    data = response.json()

    assert data["valid"] is False
    assert data["status"] == "UNABLE_TO_VERIFY"
    assert data["assertion"] is None
