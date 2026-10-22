from app.db.base import Base
from app import models  # noqa: F401


def test_section_three_tables_and_foreign_key_targets_are_registered() -> None:
    assert {
        "institutions",
        "approved_intakes",
        "students",
        "admission_records",
        "submission_batches",
        "validation_results",
        "verification_tokens",
    }.issubset(Base.metadata.tables)
    assert {"programmes", "users"}.issubset(Base.metadata.tables)


def test_approved_intake_has_required_unique_key() -> None:
    table = Base.metadata.tables["approved_intakes"]
    assert any(
        constraint.name == "uq_approved_intakes_institution_programme_year"
        for constraint in table.constraints
    )
