import uuid
from datetime import datetime

from sqlalchemy import CHAR, DateTime, Enum, ForeignKey, Index, Integer, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import BatchStatus, ValidationSeverity, ValidationStatus


class SubmissionBatch(Base):
    __tablename__ = "submission_batches"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutions.id"))
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    original_filename: Mapped[str] = mapped_column(String(255))
    file_sha256: Mapped[str] = mapped_column(CHAR(64))
    total_rows: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    accepted_rows: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    flagged_rows: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    rejected_rows: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    status: Mapped[BatchStatus] = mapped_column(
        Enum(BatchStatus, name="batch_status", values_callable=lambda enum: [item.value for item in enum])
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ValidationResult(Base):
    __tablename__ = "validation_results"
    __table_args__ = (Index("ix_validation_results_batch_rule", "batch_id", "rule_code"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submission_batches.id"), index=True)
    row_index: Mapped[int] = mapped_column(Integer)
    rule_code: Mapped[str] = mapped_column(String(32), index=True)
    severity: Mapped[ValidationSeverity] = mapped_column(
        Enum(ValidationSeverity, name="validation_severity", values_callable=lambda enum: [item.value for item in enum])
    )
    status: Mapped[ValidationStatus] = mapped_column(
        Enum(ValidationStatus, name="validation_status", values_callable=lambda enum: [item.value for item in enum])
    )
    rule_description: Mapped[str] = mapped_column(Text)
    evidence_payload: Mapped[dict] = mapped_column(JSONB)
    remediation_hint: Mapped[str] = mapped_column(Text)
