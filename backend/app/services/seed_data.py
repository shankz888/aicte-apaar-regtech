"""Baseline demonstration reference data provisioner.

Ensures that the statutory demonstration environment (PRD Section 10) is always
pre-seeded with:
1. Institution A (Apex Institute of Technology, #SYN-MH-0001, Capacity 120)
2. Institution B (Karnataka State Engineering College, #SYN-KA-0002)
3. Conflicting active enrolment for Rahul Verma (APAAR 999988887779) at Institution B
   so that uploading synthetic_batch_concurrent_transfer.csv triggers DUP-002.
4. Demo token chk_demo8723 for Zero-Knowledge external verification.
"""

from __future__ import annotations

import uuid
from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AdmissionRecord, ApprovedIntake, Institution, Programme, Student
from app.models.enums import AdmissionCategory, ApaarStatus, EnrolmentStatus, Gender, InstitutionStatus, IntakeStatus
from app.services.verification_service import ensure_demo_token

INST_A_ID = uuid.UUID("20000000-0000-4000-8000-000000000001")
INST_B_ID = uuid.UUID("20000000-0000-4000-8000-000000000002")
PROG_CSE_ID = uuid.UUID("10000000-0000-4000-8000-000000000001")
RAHUL_APAAR = "999988887779"


def ensure_baseline_demo_data(session: Session) -> None:
    """Pre-seeds baseline institutions, programs, and the DUP-002 conflicting student record."""
    # 1. Programme CSE
    prog = session.get(Programme, PROG_CSE_ID)
    if prog is None:
        prog = Programme(
            id=PROG_CSE_ID,
            code="BTECH-CSE",
            name="B.Tech Computer Science and Engineering",
        )
        session.add(prog)
        session.flush()

    # 2. Institution A (Apex Institute of Technology)
    inst_a = session.get(Institution, INST_A_ID)
    if inst_a is None:
        inst_a = Institution(
            id=INST_A_ID,
            aicte_permanent_id="SYN-MH-0001",
            legal_name="Apex Institute of Technology",
            state="Maharashtra",
            status=InstitutionStatus.active,
        )
        session.add(inst_a)
        session.flush()

    # 3. Institution B (Karnataka State Engineering College)
    inst_b = session.get(Institution, INST_B_ID)
    if inst_b is None:
        inst_b = Institution(
            id=INST_B_ID,
            aicte_permanent_id="SYN-KA-0002",
            legal_name="Karnataka State Engineering College",
            state="Karnataka",
            status=InstitutionStatus.active,
        )
        session.add(inst_b)
        session.flush()

    # 4. Approved Intake for Inst A: Capacity 120
    intake_a = session.scalar(
        select(ApprovedIntake).where(
            ApprovedIntake.institution_id == inst_a.id,
            ApprovedIntake.programme_id == prog.id,
            ApprovedIntake.academic_year == "2026-2027",
        )
    )
    if intake_a is None:
        intake_a = ApprovedIntake(
            institution_id=inst_a.id,
            programme_id=prog.id,
            academic_year="2026-2027",
            approved_capacity=120,
            supernumerary_nri_cap=18,
            supernumerary_fn_cap=6,
            lateral_entry_cap=12,
            status=IntakeStatus.active,
        )
        session.add(intake_a)
        session.flush()

    # 5. Conflicting Student (Rahul Verma) enrolled at Institution B
    rahul = session.scalar(select(Student).where(Student.apaar_id == RAHUL_APAAR))
    if rahul is None:
        rahul = Student(
            apaar_id=RAHUL_APAAR,
            apaar_status=ApaarStatus.verified,
            full_name="Rahul Verma",
            gender=Gender.male,
        )
        session.add(rahul)
        session.flush()

    # Ensure Rahul has an active admission record at Institution B (NOT Institution A)
    # If any accidental record exists at Inst A from prior demo, remove it
    accidental_a = session.scalar(
        select(AdmissionRecord).where(
            AdmissionRecord.student_id == rahul.id,
            AdmissionRecord.institution_id == inst_a.id,
        )
    )
    if accidental_a is not None:
        session.delete(accidental_a)
        session.flush()

    adm_b = session.scalar(
        select(AdmissionRecord).where(
            AdmissionRecord.student_id == rahul.id,
            AdmissionRecord.institution_id == inst_b.id,
            AdmissionRecord.enrolment_status == EnrolmentStatus.active,
        )
    )
    if adm_b is None:
        adm_b = AdmissionRecord(
            student_id=rahul.id,
            institution_id=inst_b.id,
            programme_id=prog.id,
            academic_year="2026-2027",
            admission_category=AdmissionCategory.general,
            enrolment_status=EnrolmentStatus.active,
            start_date=date(2026, 7, 15),
            is_verified_active=True,
        )
        session.add(adm_b)
        session.flush()

    # 6. Ensure demo token chk_demo8723 exists
    ensure_demo_token(session)
    session.commit()
