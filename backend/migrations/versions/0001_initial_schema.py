"""Create the initial institutional verification schema.

Revision ID: 0001_initial_schema
Revises:
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "institutions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("aicte_permanent_id", sa.String(length=32), nullable=False),
        sa.Column("legal_name", sa.String(length=255), nullable=False),
        sa.Column("state", sa.String(length=64), nullable=False),
        sa.Column("status", sa.Enum("active", "probation", "suspended", name="institution_status"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("aicte_permanent_id"),
    )
    op.create_index("ix_institutions_aicte_permanent_id", "institutions", ["aicte_permanent_id"], unique=True)

    op.create_table(
        "programmes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_programmes_code", "programmes", ["code"], unique=True)

    op.create_table("users", sa.Column("id", sa.Uuid(), nullable=False), sa.PrimaryKeyConstraint("id"))

    op.create_table(
        "students",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("apaar_id", sa.String(length=12), nullable=True),
        sa.Column("apaar_status", sa.Enum("verified", "pending_apaar", "failed_verification", "unavailable", name="apaar_status"), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("gender", sa.Enum("male", "female", "transgender", "prefer_not_to_say", name="student_gender"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("apaar_id"),
    )
    op.create_index("ix_students_apaar_id", "students", ["apaar_id"], unique=True)

    op.create_table(
        "approved_intakes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("institution_id", sa.Uuid(), nullable=False),
        sa.Column("programme_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year", sa.String(length=9), nullable=False),
        sa.Column("approved_capacity", sa.Integer(), nullable=False),
        sa.Column("supernumerary_nri_cap", sa.Integer(), nullable=False),
        sa.Column("supernumerary_fn_cap", sa.Integer(), nullable=False),
        sa.Column("lateral_entry_cap", sa.Integer(), nullable=False),
        sa.Column("status", sa.Enum("active", "frozen", name="intake_status"), nullable=False),
        sa.ForeignKeyConstraint(["institution_id"], ["institutions.id"]),
        sa.ForeignKeyConstraint(["programme_id"], ["programmes.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("institution_id", "programme_id", "academic_year", name="uq_approved_intakes_institution_programme_year"),
    )

    op.create_table(
        "admission_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("institution_id", sa.Uuid(), nullable=False),
        sa.Column("programme_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year", sa.String(length=9), nullable=False),
        sa.Column("admission_category", sa.Enum("general", "ews", "sc_st_obc", "nri", "foreign_national", "lateral_entry", name="admission_category"), nullable=False),
        sa.Column("enrolment_status", sa.Enum("active", "transferred", "withdrawn", "graduated", "cancelled", name="enrolment_status"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("is_verified_active", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(["institution_id"], ["institutions.id"]),
        sa.ForeignKeyConstraint(["programme_id"], ["programmes.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "submission_batches",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("institution_id", sa.Uuid(), nullable=False),
        sa.Column("uploaded_by", sa.Uuid(), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("file_sha256", sa.CHAR(length=64), nullable=False),
        sa.Column("total_rows", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("accepted_rows", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("flagged_rows", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("rejected_rows", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("status", sa.Enum("queued", "parsing", "validating", "completed", "failed", name="batch_status"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["institution_id"], ["institutions.id"]),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "validation_results",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("row_index", sa.Integer(), nullable=False),
        sa.Column("rule_code", sa.String(length=32), nullable=False),
        sa.Column("severity", sa.Enum("blocking", "warning", "info", name="validation_severity"), nullable=False),
        sa.Column("status", sa.Enum("accepted", "flagged", "rejected", name="validation_status"), nullable=False),
        sa.Column("rule_description", sa.Text(), nullable=False),
        sa.Column("evidence_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("remediation_hint", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["batch_id"], ["submission_batches.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_validation_results_batch_id", "validation_results", ["batch_id"], unique=False)
    op.create_index("ix_validation_results_rule_code", "validation_results", ["rule_code"], unique=False)
    op.create_index("ix_validation_results_batch_rule", "validation_results", ["batch_id", "rule_code"], unique=False)

    op.create_table(
        "verification_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.CHAR(length=64), nullable=False),
        sa.Column("requester_org", sa.String(length=255), nullable=False),
        sa.Column("purpose", sa.String(length=255), nullable=False),
        sa.Column("permitted_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("verification_tokens")
    op.drop_index("ix_validation_results_batch_rule", table_name="validation_results")
    op.drop_index("ix_validation_results_rule_code", table_name="validation_results")
    op.drop_index("ix_validation_results_batch_id", table_name="validation_results")
    op.drop_table("validation_results")
    op.drop_table("submission_batches")
    op.drop_table("admission_records")
    op.drop_table("approved_intakes")
    op.drop_index("ix_students_apaar_id", table_name="students")
    op.drop_table("students")
    op.drop_table("users")
    op.drop_index("ix_programmes_code", table_name="programmes")
    op.drop_table("programmes")
    op.drop_index("ix_institutions_aicte_permanent_id", table_name="institutions")
    op.drop_table("institutions")
    op.execute("DROP TYPE validation_status")
    op.execute("DROP TYPE validation_severity")
    op.execute("DROP TYPE batch_status")
    op.execute("DROP TYPE enrolment_status")
    op.execute("DROP TYPE admission_category")
    op.execute("DROP TYPE intake_status")
    op.execute("DROP TYPE student_gender")
    op.execute("DROP TYPE apaar_status")
    op.execute("DROP TYPE institution_status")
