"""Pytest fixtures and configuration."""

import uuid
from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import engine, get_db
from app.main import app
from app.models import ApprovedIntake, Institution, Programme, User
from app.models.enums import InstitutionStatus, IntakeStatus
from app.services.apaar_adapter import MockApaarServiceAdapter


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Provides a transactional database session rolled back after every test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """TestClient wired with the rolled-back test session."""
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def test_setup(db_session: Session) -> dict[str, Any]:
    """Ensures test institutions, programmes, and approved intakes exist."""
    # Ensure test isolation: clean admission records in the test savepoint
    from app.models import AdmissionRecord
    db_session.query(AdmissionRecord).delete()
    db_session.flush()

    # Ensure default user
    user = db_session.scalar(select(User))
    if user is None:
        user = User(id=uuid.UUID("00000000-0000-4000-8000-000000000001"))
        db_session.add(user)
        db_session.flush()

    # Programme 1
    prog1_id = uuid.UUID("10000000-0000-4000-8000-000000000001")
    prog1 = db_session.get(Programme, prog1_id)
    if prog1 is None:
        prog1 = Programme(id=prog1_id, code="BTECH-CSE", name="B.Tech Computer Science and Engineering")
        db_session.add(prog1)
        db_session.flush()

    # Programme 2
    prog2_id = uuid.UUID("10000000-0000-4000-8000-000000000002")
    prog2 = db_session.get(Programme, prog2_id)
    if prog2 is None:
        prog2 = Programme(id=prog2_id, code="BTECH-ECE", name="B.Tech Electronics and Communication Engineering")
        db_session.add(prog2)
        db_session.flush()

    # Institution A
    inst_a_id = uuid.UUID("20000000-0000-4000-8000-000000000001")
    inst_a = db_session.get(Institution, inst_a_id)
    if inst_a is None:
        inst_a = Institution(
            id=inst_a_id,
            aicte_permanent_id="SYN-MH-0001",
            legal_name="Apex Institute of Technology",
            state="Maharashtra",
            status=InstitutionStatus.active,
        )
        db_session.add(inst_a)
        db_session.flush()

    # Institution B (for cross-institution clash tests)
    inst_b_id = uuid.UUID("20000000-0000-4000-8000-000000000002")
    inst_b = db_session.get(Institution, inst_b_id)
    if inst_b is None:
        inst_b = Institution(
            id=inst_b_id,
            aicte_permanent_id="SYN-KA-0002",
            legal_name="Karnataka State Engineering College",
            state="Karnataka",
            status=InstitutionStatus.active,
        )
        db_session.add(inst_b)
        db_session.flush()

    # Intake for Institution A (CSE: capacity 120, NRI cap 18)
    intake_a = db_session.scalar(
        select(ApprovedIntake).where(
            ApprovedIntake.institution_id == inst_a.id,
            ApprovedIntake.programme_id == prog1.id,
            ApprovedIntake.academic_year == "2026-2027",
        )
    )
    if intake_a is None:
        intake_a = ApprovedIntake(
            institution_id=inst_a.id,
            programme_id=prog1.id,
            academic_year="2026-2027",
            approved_capacity=120,
            supernumerary_nri_cap=18,
            supernumerary_fn_cap=6,
            lateral_entry_cap=12,
            status=IntakeStatus.active,
        )
        db_session.add(intake_a)
        db_session.flush()

    # Intake for Institution B (CSE: capacity 180, NRI cap 27)
    intake_b = db_session.scalar(
        select(ApprovedIntake).where(
            ApprovedIntake.institution_id == inst_b.id,
            ApprovedIntake.programme_id == prog1.id,
            ApprovedIntake.academic_year == "2026-2027",
        )
    )
    if intake_b is None:
        intake_b = ApprovedIntake(
            institution_id=inst_b.id,
            programme_id=prog1.id,
            academic_year="2026-2027",
            approved_capacity=180,
            supernumerary_nri_cap=27,
            supernumerary_fn_cap=9,
            lateral_entry_cap=18,
            status=IntakeStatus.active,
        )
        db_session.add(intake_b)
        db_session.flush()

    return {
        "user": user,
        "inst_a": inst_a,
        "inst_b": inst_b,
        "prog1": prog1,
        "prog2": prog2,
        "intake_a": intake_a,
        "intake_b": intake_b,
    }
