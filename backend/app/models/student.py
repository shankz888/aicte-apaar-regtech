import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import AdmissionCategory, ApaarStatus, EnrolmentStatus, Gender


class Student(Base):
    __tablename__ = "students"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    apaar_id: Mapped[str | None] = mapped_column(String(12), unique=True, index=True, nullable=True)
    apaar_status: Mapped[ApaarStatus] = mapped_column(
        Enum(ApaarStatus, name="apaar_status", values_callable=lambda enum: [item.value for item in enum])
    )
    full_name: Mapped[str] = mapped_column(String(255))
    gender: Mapped[Gender] = mapped_column(
        Enum(Gender, name="student_gender", values_callable=lambda enum: [item.value for item in enum])
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AdmissionRecord(Base):
    __tablename__ = "admission_records"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id"))
    institution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutions.id"))
    programme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programmes.id"))
    academic_year: Mapped[str] = mapped_column(String(9))
    admission_category: Mapped[AdmissionCategory] = mapped_column(
        Enum(AdmissionCategory, name="admission_category", values_callable=lambda enum: [item.value for item in enum])
    )
    enrolment_status: Mapped[EnrolmentStatus] = mapped_column(
        Enum(EnrolmentStatus, name="enrolment_status", values_callable=lambda enum: [item.value for item in enum])
    )
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_verified_active: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
