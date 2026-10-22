import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import InstitutionStatus, IntakeStatus


class Institution(Base):
    __tablename__ = "institutions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    aicte_permanent_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    legal_name: Mapped[str] = mapped_column(String(255))
    state: Mapped[str] = mapped_column(String(64))
    status: Mapped[InstitutionStatus] = mapped_column(
        Enum(InstitutionStatus, name="institution_status", values_callable=lambda enum: [item.value for item in enum])
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ApprovedIntake(Base):
    __tablename__ = "approved_intakes"
    __table_args__ = (
        UniqueConstraint(
            "institution_id",
            "programme_id",
            "academic_year",
            name="uq_approved_intakes_institution_programme_year",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutions.id"))
    programme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programmes.id"))
    academic_year: Mapped[str] = mapped_column(String(9))
    approved_capacity: Mapped[int] = mapped_column(Integer)
    supernumerary_nri_cap: Mapped[int] = mapped_column(Integer)
    supernumerary_fn_cap: Mapped[int] = mapped_column(Integer)
    lateral_entry_cap: Mapped[int] = mapped_column(Integer)
    status: Mapped[IntakeStatus] = mapped_column(
        Enum(IntakeStatus, name="intake_status", values_callable=lambda enum: [item.value for item in enum])
    )
