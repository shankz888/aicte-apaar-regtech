import uuid

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import ApprovedIntake, Institution, Programme
from app.models.enums import InstitutionStatus, IntakeStatus

PROGRAMMES = (
    (uuid.UUID("10000000-0000-4000-8000-000000000001"), "BTECH-CSE", "B.Tech Computer Science and Engineering"),
    (uuid.UUID("10000000-0000-4000-8000-000000000002"), "BTECH-ECE", "B.Tech Electronics and Communication Engineering"),
)

INSTITUTIONS = (
    {
        "id": uuid.UUID("20000000-0000-4000-8000-000000000001"),
        "aicte_permanent_id": "SYN-MH-0001",
        "legal_name": "Sample Institute of Technology",
        "state": "Maharashtra",
        "intakes": ((PROGRAMMES[0][0], 120, 18, 6, 12), (PROGRAMMES[1][0], 60, 9, 3, 6)),
    },
    {
        "id": uuid.UUID("20000000-0000-4000-8000-000000000002"),
        "aicte_permanent_id": "SYN-KA-0002",
        "legal_name": "Example College of Engineering",
        "state": "Karnataka",
        "intakes": ((PROGRAMMES[0][0], 180, 27, 9, 18), (PROGRAMMES[1][0], 120, 18, 6, 12)),
    },
)


def seed() -> None:
    with SessionLocal.begin() as session:
        programmes_by_id: dict[uuid.UUID, Programme] = {}
        for programme_id, code, name in PROGRAMMES:
            programme = session.get(Programme, programme_id)
            if programme is None:
                programme = Programme(id=programme_id, code=code, name=name)
                session.add(programme)
            programmes_by_id[programme_id] = programme

        for institution_data in INSTITUTIONS:
            institution = session.scalar(
                select(Institution).where(
                    Institution.aicte_permanent_id == institution_data["aicte_permanent_id"]
                )
            )
            if institution is None:
                institution = Institution(
                    id=institution_data["id"],
                    aicte_permanent_id=institution_data["aicte_permanent_id"],
                    legal_name=institution_data["legal_name"],
                    state=institution_data["state"],
                    status=InstitutionStatus.active,
                )
                session.add(institution)
                session.flush()

            for programme_id, capacity, nri_cap, fn_cap, lateral_cap in institution_data["intakes"]:
                intake = session.scalar(
                    select(ApprovedIntake).where(
                        ApprovedIntake.institution_id == institution.id,
                        ApprovedIntake.programme_id == programme_id,
                        ApprovedIntake.academic_year == "2026-2027",
                    )
                )
                if intake is None:
                    session.add(
                        ApprovedIntake(
                            institution_id=institution.id,
                            programme_id=programmes_by_id[programme_id].id,
                            academic_year="2026-2027",
                            approved_capacity=capacity,
                            supernumerary_nri_cap=nri_cap,
                            supernumerary_fn_cap=fn_cap,
                            lateral_entry_cap=lateral_cap,
                            status=IntakeStatus.active,
                        )
                    )

        from app.services.seed_data import ensure_baseline_demo_data
        ensure_baseline_demo_data(session)


if __name__ == "__main__":
    seed()

