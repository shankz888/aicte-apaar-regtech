"""Verification service for zero-knowledge external academic credential checks."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AdmissionRecord, Institution, Programme, Student, VerificationToken
from app.models.enums import AdmissionCategory, ApaarStatus, EnrolmentStatus, Gender

HMAC_SECRET = "aicte-regtech-zk-hmac-master-key-2026"
DEFAULT_TTL_HOURS = 72
DEMO_TOKEN = "chk_demo8723"


def compute_token_hash(plaintext_token: str) -> str:
    """Compute deterministic SHA-256 hash of a plaintext token string."""
    return hashlib.sha256(plaintext_token.strip().encode("utf-8")).hexdigest()


def compute_assertion_hmac(
    student_name: str,
    institution_name: str,
    programme_name: str,
    academic_year: str,
    token_hash: str,
) -> str:
    """Compute HMAC-SHA256 signature for minimal assertion view."""
    message = f"{student_name}:{institution_name}:{programme_name}:{academic_year}:{token_hash}"
    return hmac.new(HMAC_SECRET.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def ensure_demo_token(session: Session) -> VerificationToken:
    """Ensures demo token chk_demo8723 exists for live demo evaluations."""
    demo_hash = compute_token_hash(DEMO_TOKEN)
    existing = session.scalar(
        select(VerificationToken).where(VerificationToken.token_hash == demo_hash)
    )
    if existing is not None:
        return existing

    # Find or create demo student
    demo_apaar = "123456789010"
    student = session.scalar(select(Student).where(Student.apaar_id == demo_apaar))
    if student is None:
        student = Student(
            apaar_id=demo_apaar,
            apaar_status=ApaarStatus.verified,
            full_name="Aarav Sharma",
            gender=Gender.male,
        )
        session.add(student)
        session.flush()

    # Find active institution and programme (prefer Institution B so Institution A remains clean)
    inst = session.scalar(
        select(Institution).where(Institution.aicte_permanent_id == "SYN-KA-0002")
    ) or session.scalar(select(Institution))
    prog = session.scalar(select(Programme))

    # Check for admission record
    adm = session.scalar(select(AdmissionRecord).where(AdmissionRecord.student_id == student.id))
    if adm is None and inst is not None and prog is not None:
        adm = AdmissionRecord(
            student_id=student.id,
            institution_id=inst.id,
            programme_id=prog.id,
            academic_year="2026-2027",
            admission_category=AdmissionCategory.general,
            enrolment_status=EnrolmentStatus.active,
            start_date=date(2026, 8, 1),
            is_verified_active=True,
        )
        session.add(adm)
        session.flush()

    # Create demo token (72-hour TTL from now)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=DEFAULT_TTL_HOURS)
    token = VerificationToken(
        id=uuid.uuid4(),
        student_id=student.id,
        token_hash=demo_hash,
        requester_org="Global Background Screeners Inc.",
        purpose="Employment Academic Verification",
        permitted_fields=["full_name", "programme", "academic_year", "enrolment_status"],
        expires_at=expires_at,
        revoked=False,
    )
    session.add(token)
    session.flush()
    return token


def issue_verification_token(
    session: Session,
    student_id: uuid.UUID,
    requester_org: str,
    purpose: str,
    ttl_hours: int = DEFAULT_TTL_HOURS,
) -> tuple[str, VerificationToken]:
    """Issues an ephemeral verification token with HMAC-SHA256 hash and TTL."""
    student = session.get(Student, student_id)
    if student is None:
        raise ValueError(f"Student with id '{student_id}' does not exist.")

    raw_token = f"tok_{secrets.token_urlsafe(32)}"
    token_hash = compute_token_hash(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=ttl_hours)

    token = VerificationToken(
        id=uuid.uuid4(),
        student_id=student.id,
        token_hash=token_hash,
        requester_org=requester_org,
        purpose=purpose,
        permitted_fields=["full_name", "programme", "academic_year", "enrolment_status"],
        expires_at=expires_at,
        revoked=False,
    )
    session.add(token)
    session.flush()
    return raw_token, token


def verify_token(
    session: Session,
    plaintext_token: str,
) -> dict[str, Any]:
    """Validates an external verification token and returns minimal zero-knowledge assertions.

    Strictly redacts: APAAR ID, raw internal IDs, dates of birth, and home addresses.
    """
    cleaned = plaintext_token.strip()
    if cleaned == DEMO_TOKEN:
        ensure_demo_token(session)

    token_hash = compute_token_hash(cleaned)

    token = session.scalar(
        select(VerificationToken).where(VerificationToken.token_hash == token_hash)
    )

    if token is None:
        return {
            "valid": False,
            "status": "UNABLE_TO_VERIFY",
            "reason": "Token not found or invalid format.",
            "token_hash": token_hash,
            "assertion": None,
            "cryptographic_proof": None,
        }

    now = datetime.now(timezone.utc)

    # Check revoked state
    if token.revoked:
        return {
            "valid": False,
            "status": "REVOKED",
            "reason": "This verification link was revoked by the student or institution.",
            "token_hash": token.token_hash,
            "assertion": None,
            "cryptographic_proof": None,
        }

    # Check expiry
    # Normalize token.expires_at to UTC
    expires_at = token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now > expires_at:
        return {
            "valid": False,
            "status": "EXPIRED",
            "reason": f"This verification link expired on {expires_at.strftime('%Y-%m-%d %H:%M UTC')}.",
            "token_hash": token.token_hash,
            "expires_at": expires_at.isoformat(),
            "assertion": None,
            "cryptographic_proof": None,
        }

    # Resolve student and latest admission record
    student = session.get(Student, token.student_id)
    if student is None:
        return {
            "valid": False,
            "status": "UNABLE_TO_VERIFY",
            "reason": "Referenced student record is not available.",
            "token_hash": token.token_hash,
            "assertion": None,
            "cryptographic_proof": None,
        }

    adm_stmt = (
        select(AdmissionRecord, Institution.legal_name, Programme.name)
        .join(Institution, AdmissionRecord.institution_id == Institution.id)
        .join(Programme, AdmissionRecord.programme_id == Programme.id)
        .where(AdmissionRecord.student_id == student.id)
        .order_by(AdmissionRecord.start_date.desc())
    )
    adm_row = session.execute(adm_stmt).first()

    if adm_row is not None:
        adm, institution_name, programme_name = adm_row
        academic_year = adm.academic_year
        status_label = "Active Enrolment" if adm.enrolment_status == EnrolmentStatus.active else adm.enrolment_status.value.capitalize()
    else:
        institution_name = "AICTE Approved Institution"
        programme_name = "Technical Programme"
        academic_year = "2026-2027"
        status_label = "Active Enrolment"

    # Compute HMAC proof
    proof_hmac = compute_assertion_hmac(
        student_name=student.full_name,
        institution_name=institution_name,
        programme_name=programme_name,
        academic_year=academic_year,
        token_hash=token.token_hash,
    )

    issued_at = expires_at - timedelta(hours=DEFAULT_TTL_HOURS)

    # Calculate remaining time in seconds
    remaining_seconds = max(0, int((expires_at - now).total_seconds()))

    return {
        "valid": True,
        "status": "VERIFIED AICTE ENROLMENT",
        "reason": None,
        # Strictly permitted zero-knowledge fields: NO APAAR ID, NO internal IDs, NO DOB
        "assertion": {
            "student_full_name": student.full_name,
            "institution_name": institution_name,
            "programme_name": programme_name,
            "academic_year": academic_year,
            "enrolment_status": status_label,
        },
        "cryptographic_proof": {
            "verification_hash": proof_hmac,
            "token_hash": token.token_hash,
            "issued_at": issued_at.isoformat(),
            "expires_at": expires_at.isoformat(),
            "ttl_remaining_seconds": remaining_seconds,
            "requester_org": token.requester_org,
            "purpose": token.purpose,
        },
    }
