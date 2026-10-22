"""Validation engine orchestrator for student admission batches."""

from __future__ import annotations

import csv
import io
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.batch import ValidationResult
from app.models.enums import (
    AdmissionCategory,
    ApaarStatus,
    EnrolmentStatus,
    Gender,
    ValidationSeverity,
    ValidationStatus,
)
from app.models.institutional import ApprovedIntake
from app.models.student import AdmissionRecord, Student
from app.models.supporting import Programme
from app.services.apaar_adapter import MockApaarServiceAdapter, apaar_adapter
from app.services.validation.rules import (
    RuleViolation,
    validate_apr_001,
    validate_apr_002,
    validate_cap_001,
    validate_cap_002,
    validate_dup_001,
    validate_dup_002,
    validate_sch_001_headers,
    validate_sch_001_row,
    validate_sch_002,
)

REGULAR_CATEGORIES = {
    AdmissionCategory.general,
    AdmissionCategory.ews,
    AdmissionCategory.sc_st_obc,
}


@dataclass
class ValidatedRow:
    row_index: int
    raw_dict: dict[str, str]
    raw_columns: list[str]
    status: ValidationStatus
    violations: list[RuleViolation] = field(default_factory=list)
    programme_id: uuid.UUID | None = None


@dataclass
class EngineValidationSummary:
    total_rows: int
    accepted_rows: int
    flagged_rows: int
    rejected_rows: int
    header_violation: RuleViolation | None
    validated_rows: list[ValidatedRow]


class ValidationEngine:
    def __init__(
        self,
        session: Session,
        institution_id: uuid.UUID,
        adapter: MockApaarServiceAdapter | None = None,
    ) -> None:
        self.session = session
        self.institution_id = institution_id
        self.adapter = adapter or apaar_adapter

        # Caches
        self._programme_cache: dict[str, Programme | None] = {}
        self._intake_cache: dict[tuple[uuid.UUID, str], ApprovedIntake | None] = {}
        self._current_regular_admissions: dict[tuple[uuid.UUID, str], int] = {}
        self._current_nri_admissions: dict[tuple[uuid.UUID, str], int] = {}
        self._total_regular_attempts: dict[tuple[uuid.UUID, str], int] = {}
        self._total_nri_attempts: dict[tuple[uuid.UUID, str], int] = {}

    def _get_programme(self, code: str) -> Programme | None:
        cleaned = code.strip().upper()
        if cleaned not in self._programme_cache:
            prog = self.session.scalar(select(Programme).where(Programme.code == cleaned))
            self._programme_cache[cleaned] = prog
        return self._programme_cache[cleaned]

    def _get_approved_intake(self, programme_id: uuid.UUID, academic_year: str) -> ApprovedIntake | None:
        key = (programme_id, academic_year.strip())
        if key not in self._intake_cache:
            intake = self.session.scalar(
                select(ApprovedIntake).where(
                    ApprovedIntake.institution_id == self.institution_id,
                    ApprovedIntake.programme_id == programme_id,
                    ApprovedIntake.academic_year == academic_year.strip(),
                )
            )
            self._intake_cache[key] = intake
        return self._intake_cache[key]

    def _get_active_counts(
        self, programme_id: uuid.UUID, academic_year: str
    ) -> tuple[int, int]:
        key = (programme_id, academic_year.strip())
        if key not in self._current_regular_admissions:
            # Query existing active admissions in DB
            base_query = (
                select(AdmissionRecord.admission_category, func.count(AdmissionRecord.id))
                .where(
                    AdmissionRecord.institution_id == self.institution_id,
                    AdmissionRecord.programme_id == programme_id,
                    AdmissionRecord.academic_year == academic_year.strip(),
                    AdmissionRecord.enrolment_status == EnrolmentStatus.active,
                )
                .group_by(AdmissionRecord.admission_category)
            )
            results = self.session.execute(base_query).all()
            reg_count = 0
            nri_count = 0
            for cat, count in results:
                if cat in REGULAR_CATEGORIES:
                    reg_count += count
                elif cat == AdmissionCategory.nri:
                    nri_count += count

            self._current_regular_admissions[key] = reg_count
            self._current_nri_admissions[key] = nri_count
            self._total_regular_attempts[key] = reg_count
            self._total_nri_attempts[key] = nri_count

        return self._current_regular_admissions[key], self._current_nri_admissions[key]

    def validate_csv_content(self, csv_text: str) -> EngineValidationSummary:
        """Parse and validate entire CSV stream content."""
        reader = csv.reader(io.StringIO(csv_text))
        try:
            raw_headers = next(reader)
        except StopIteration:
            header_err = validate_sch_001_headers([])
            return EngineValidationSummary(
                total_rows=0,
                accepted_rows=0,
                flagged_rows=0,
                rejected_rows=0,
                header_violation=header_err,
                validated_rows=[],
            )

        # Validate headers
        header_err = validate_sch_001_headers(raw_headers)
        if header_err is not None:
            return EngineValidationSummary(
                total_rows=0,
                accepted_rows=0,
                flagged_rows=0,
                rejected_rows=0,
                header_violation=header_err,
                validated_rows=[],
            )

        headers = [h.strip().lower() for h in raw_headers]
        expected_len = len(headers)

        seen_identifiers: dict[str, int] = {}
        validated_rows: list[ValidatedRow] = []

        total_rows = 0
        accepted_rows = 0
        flagged_rows = 0
        rejected_rows = 0

        for row_index, raw_cols in enumerate(reader, start=1):
            total_rows += 1
            violations: list[RuleViolation] = []

            # 1. Row column count check (SCH-001)
            row_col_err = validate_sch_001_row(len(raw_cols), expected_len, ",".join(raw_cols))
            if row_col_err:
                violations.append(row_col_err)

            # Map to dict using headers
            row_dict = {
                headers[i]: (raw_cols[i].strip() if i < len(raw_cols) else "")
                for i in range(len(headers))
            }

            apaar_id = row_dict.get("apaar_id") or None
            if apaar_id:
                apaar_id = apaar_id.strip()
            full_name = row_dict.get("full_name", "").strip()
            academic_year = row_dict.get("academic_year", "").strip()
            programme_code = row_dict.get("programme_code", "").strip()
            admission_cat_str = row_dict.get("admission_category", "").strip().lower()
            start_date_str = row_dict.get("start_date", "").strip()

            # 2. Academic year format (SCH-002)
            sch_002_err = validate_sch_002(academic_year)
            if sch_002_err:
                violations.append(sch_002_err)

            # 3. APAAR Boundary checks (APR-001 and APR-002)
            if not apaar_id:
                apr_001 = validate_apr_001(apaar_id)
                if apr_001:
                    violations.append(apr_001)
            else:
                apr_002 = validate_apr_002(apaar_id, adapter=self.adapter)
                if apr_002:
                    violations.append(apr_002)

            # 4. Intra-batch duplicate check (DUP-001)
            if apaar_id:
                ident_key = f"apaar:{apaar_id}"
            else:
                ident_key = f"composite:{full_name.lower()}:{programme_code.upper()}:{academic_year}"

            dup_001 = validate_dup_001(ident_key, seen_identifiers, row_index)
            if dup_001:
                violations.append(dup_001)
            else:
                seen_identifiers[ident_key] = row_index

            # 5. Cross-institution conflict check (DUP-002)
            if apaar_id and not any(v.rule_code == "APR-002" for v in violations):
                dup_002 = validate_dup_002(apaar_id, self.institution_id, self.session)
                if dup_002:
                    violations.append(dup_002)

            # Programme resolution
            prog = self._get_programme(programme_code)
            if prog is None:
                violations.append(
                    RuleViolation(
                        rule_code="SCH-001",
                        severity=ValidationSeverity.blocking,
                        status=ValidationStatus.rejected,
                        rule_description=f"Unknown programme code '{programme_code}'.",
                        evidence_payload={"programme_code": programme_code},
                        remediation_hint="Ensure programme_code matches an AICTE approved programme.",
                    )
                )

            # 6. Capacity Checks (CAP-001 and CAP-002)
            # Parse admission category
            category: AdmissionCategory | None = None
            try:
                category = AdmissionCategory(admission_cat_str)
            except ValueError:
                violations.append(
                    RuleViolation(
                        rule_code="SCH-001",
                        severity=ValidationSeverity.blocking,
                        status=ValidationStatus.rejected,
                        rule_description=f"Invalid admission category '{admission_cat_str}'.",
                        evidence_payload={"admission_category": admission_cat_str},
                        remediation_hint=f"Must be one of {[c.value for c in AdmissionCategory]}.",
                    )
                )

            intake_record: ApprovedIntake | None = None
            if prog is not None and sch_002_err is None:
                intake_record = self._get_approved_intake(prog.id, academic_year)
                if intake_record is None:
                    violations.append(
                        RuleViolation(
                            rule_code="CAP-001",
                            severity=ValidationSeverity.blocking,
                            status=ValidationStatus.rejected,
                            rule_description=(
                                f"No approved intake found for programme '{programme_code}' "
                                f"in academic year '{academic_year}'."
                            ),
                            evidence_payload={
                                "programme_code": programme_code,
                                "academic_year": academic_year,
                                "approved_capacity": 0,
                            },
                            remediation_hint="File AICTE variation request or verify academic year and programme.",
                        )
                    )

            # Check regular vs NRI capacity
            if prog is not None and intake_record is not None and category is not None:
                key = (prog.id, academic_year.strip())
                current_reg, current_nri = self._get_active_counts(prog.id, academic_year)

                if category in REGULAR_CATEGORIES:
                    self._total_regular_attempts[key] += 1
                    attempted = self._total_regular_attempts[key]
                    cap_001 = validate_cap_001(
                        current_intake=attempted,
                        approved_capacity=intake_record.approved_capacity,
                        programme_code=programme_code,
                        academic_year=academic_year,
                    )
                    if cap_001:
                        violations.append(cap_001)

                elif category == AdmissionCategory.nri:
                    self._total_nri_attempts[key] += 1
                    attempted_nri = self._total_nri_attempts[key]
                    cap_002 = validate_cap_002(
                        current_nri_intake=attempted_nri,
                        supernumerary_nri_cap=intake_record.supernumerary_nri_cap,
                        programme_code=programme_code,
                        academic_year=academic_year,
                    )
                    if cap_002:
                        violations.append(cap_002)

            # Determine final status for this row
            has_blocking = any(v.severity == ValidationSeverity.blocking for v in violations)
            has_warning = any(v.severity == ValidationSeverity.warning for v in violations)

            if has_blocking:
                row_status = ValidationStatus.rejected
                rejected_rows += 1
            elif has_warning:
                row_status = ValidationStatus.flagged
                flagged_rows += 1
                # Increment accepted regular/nri count if admitted with warning
                if prog and category:
                    key = (prog.id, academic_year.strip())
                    if category in REGULAR_CATEGORIES:
                        self._current_regular_admissions[key] += 1
                    elif category == AdmissionCategory.nri:
                        self._current_nri_admissions[key] += 1
            else:
                row_status = ValidationStatus.accepted
                accepted_rows += 1
                if prog and category:
                    key = (prog.id, academic_year.strip())
                    if category in REGULAR_CATEGORIES:
                        self._current_regular_admissions[key] += 1
                    elif category == AdmissionCategory.nri:
                        self._current_nri_admissions[key] += 1

            validated_rows.append(
                ValidatedRow(
                    row_index=row_index,
                    raw_dict=row_dict,
                    raw_columns=raw_cols,
                    status=row_status,
                    violations=violations,
                    programme_id=prog.id if prog else None,
                )
            )

        return EngineValidationSummary(
            total_rows=total_rows,
            accepted_rows=accepted_rows,
            flagged_rows=flagged_rows,
            rejected_rows=rejected_rows,
            header_violation=None,
            validated_rows=validated_rows,
        )

    def promote_row_to_admission(
        self,
        validated_row: ValidatedRow,
    ) -> AdmissionRecord | None:
        """Promote an accepted or flagged student row into students and admission_records."""
        if validated_row.status == ValidationStatus.rejected:
            return None

        row = validated_row.raw_dict
        apaar_id = (row.get("apaar_id") or "").strip() or None
        full_name = row.get("full_name", "").strip()
        gender_str = row.get("gender", "prefer_not_to_say").strip().lower()
        try:
            gender = Gender(gender_str)
        except ValueError:
            gender = Gender.prefer_not_to_say

        # Check or create Student
        student: Student | None = None
        if apaar_id:
            student = self.session.scalar(select(Student).where(Student.apaar_id == apaar_id))
            if student is None:
                student = Student(
                    apaar_id=apaar_id,
                    apaar_status=ApaarStatus.verified,
                    full_name=full_name,
                    gender=gender,
                )
                self.session.add(student)
                self.session.flush()
        else:
            student = Student(
                apaar_id=None,
                apaar_status=ApaarStatus.pending_apaar,
                full_name=full_name,
                gender=gender,
            )
            self.session.add(student)
            self.session.flush()

        # Parse dates
        start_date_str = row.get("start_date", "").strip()
        try:
            start_date = date.fromisoformat(start_date_str)
        except ValueError:
            start_date = date.today()

        end_date_str = (row.get("end_date") or "").strip()
        end_date: date | None = None
        if end_date_str:
            try:
                end_date = date.fromisoformat(end_date_str)
            except ValueError:
                end_date = None

        admission_category = AdmissionCategory(row.get("admission_category", "general").strip().lower())

        record = AdmissionRecord(
            student_id=student.id,
            institution_id=self.institution_id,
            programme_id=validated_row.programme_id,
            academic_year=row.get("academic_year", "").strip(),
            admission_category=admission_category,
            enrolment_status=EnrolmentStatus.active,
            start_date=start_date,
            end_date=end_date,
            is_verified_active=True,
        )
        self.session.add(record)
        return record
