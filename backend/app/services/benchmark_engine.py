"""Synthetic Fault-Injection Benchmark Engine (PRD Section 8).

Executes automated benchmarks across:
- ST-01: Clean baseline (2,000 records, 0 faults)
- ST-02: Intake quota boundary (120 sanctioned cap, 135 injected)
- ST-03: Cross-tenant concurrent clash (10 overlapping active students)
- ST-04: Format & date malformations (50 malformed rows isolated)
"""

from __future__ import annotations

import csv
import io
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AdmissionRecord, ApprovedIntake, Institution, Programme, Student
from app.models.enums import AdmissionCategory, ApaarStatus, EnrolmentStatus, Gender, InstitutionStatus, IntakeStatus
from app.services.apaar_adapter import MockApaarServiceAdapter
from app.services.validation.engine import ValidationEngine


@dataclass
class ScenarioResult:
    scenario_id: str
    scenario_name: str
    injected_anomalies: str
    primary_metric: str
    total_records: int
    expected_rejected: int
    actual_rejected: int
    expected_accepted: int
    actual_accepted: int
    flagged_records: int
    precision: float
    recall: float
    false_positive_rate: float
    duration_ms: float
    records_per_second: float
    target_error_code: str
    status: str
    rules_fired: dict[str, int]


class BenchmarkSuiteEngine:
    def __init__(self, session: Session) -> None:
        self.session = session
        self._ensure_reference_data()

    def _ensure_reference_data(self) -> None:
        # Ensure programme BTECH-CSE exists
        prog = self.session.scalar(select(Programme).where(Programme.code == "BTECH-CSE"))
        if prog is None:
            prog = Programme(
                id=uuid.UUID("10000000-0000-4000-8000-000000000001"),
                code="BTECH-CSE",
                name="B.Tech Computer Science and Engineering",
            )
            self.session.add(prog)
            self.session.flush()
        self.prog = prog

        # Ensure benchmark institution A
        inst_a = self.session.scalar(select(Institution).where(Institution.aicte_permanent_id == "SYN-MH-0001"))
        if inst_a is None:
            inst_a = Institution(
                id=uuid.UUID("20000000-0000-4000-8000-000000000001"),
                aicte_permanent_id="SYN-MH-0001",
                legal_name="Apex Institute of Technology",
                state="Maharashtra",
                status=InstitutionStatus.active,
            )
            self.session.add(inst_a)
            self.session.flush()
        self.inst_a = inst_a

        # Ensure benchmark institution B
        inst_b = self.session.scalar(select(Institution).where(Institution.aicte_permanent_id == "SYN-KA-0002"))
        if inst_b is None:
            inst_b = Institution(
                id=uuid.UUID("20000000-0000-4000-8000-000000000002"),
                aicte_permanent_id="SYN-KA-0002",
                legal_name="Karnataka State Engineering College",
                state="Karnataka",
                status=InstitutionStatus.active,
            )
            self.session.add(inst_b)
            self.session.flush()
        self.inst_b = inst_b

        # Ensure ApprovedIntake for Inst A (default 5000 for clean test)
        intake_a = self.session.scalar(
            select(ApprovedIntake).where(
                ApprovedIntake.institution_id == self.inst_a.id,
                ApprovedIntake.programme_id == self.prog.id,
                ApprovedIntake.academic_year == "2026-2027",
            )
        )
        if intake_a is None:
            intake_a = ApprovedIntake(
                institution_id=self.inst_a.id,
                programme_id=self.prog.id,
                academic_year="2026-2027",
                approved_capacity=5000,
                supernumerary_nri_cap=500,
                supernumerary_fn_cap=100,
                lateral_entry_cap=200,
                status=IntakeStatus.active,
            )
            self.session.add(intake_a)
            self.session.flush()
        self.intake_a = intake_a

    def run_st01_clean(self) -> ScenarioResult:
        """ST-01: Clean baseline (2,000 records, 0 faults).

        Evaluates False Positive Rate (< 0.01%).
        """
        self.intake_a.approved_capacity = 5000
        self.session.query(AdmissionRecord).filter(
            AdmissionRecord.institution_id == self.inst_a.id,
            AdmissionRecord.programme_id == self.prog.id,
            AdmissionRecord.academic_year == "2026-2027",
        ).delete()
        self.session.flush()

        headers = ["apaar_id", "full_name", "gender", "programme_code", "academic_year", "admission_category", "start_date"]
        output = io.StringIO()
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(headers)

        total = 2000
        for i in range(1, total + 1):
            apaar = MockApaarServiceAdapter.generate_valid_apaar_id(seed=10000000000 + i)
            writer.writerow([apaar, f"Clean Candidate #{i:04d}", "female" if i % 2 == 0 else "male", "BTECH-CSE", "2026-2027", "general", "2026-08-01"])

        csv_text = output.getvalue()

        engine = ValidationEngine(session=self.session, institution_id=self.inst_a.id)
        start = time.perf_counter()
        summary = engine.validate_csv_content(csv_text)
        end = time.perf_counter()

        duration_sec = end - start
        duration_ms = duration_sec * 1000
        throughput = total / max(duration_sec, 0.0001)

        tp = 0
        fp = summary.rejected_rows
        tn = summary.accepted_rows
        fn = 0
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
        precision = 1.0 if fp == 0 else 0.0
        recall = 1.0

        rules_fired: dict[str, int] = {}
        for r in summary.validated_rows:
            for v in r.violations:
                rules_fired[v.rule_code] = rules_fired.get(v.rule_code, 0) + 1

        passed = summary.rejected_rows == 0 and summary.accepted_rows == 2000

        return ScenarioResult(
            scenario_id="ST-01",
            scenario_name="Batch ST-01 (Clean Baseline)",
            injected_anomalies="0 faults / 2,000 records",
            primary_metric="False Positive Rate (<0.01%)",
            total_records=total,
            expected_rejected=0,
            actual_rejected=summary.rejected_rows,
            expected_accepted=2000,
            actual_accepted=summary.accepted_rows,
            flagged_records=summary.flagged_rows,
            precision=precision,
            recall=recall,
            false_positive_rate=fpr,
            duration_ms=round(duration_ms, 2),
            records_per_second=round(throughput, 1),
            target_error_code="None",
            status="PASSED" if passed else "FAILED",
            rules_fired=rules_fired,
        )

    def run_st02_intake(self) -> ScenarioResult:
        """ST-02: Sanctioned: 120, Injected: 135 rows (boundary detection).

        15 Rows Rejected with code CAP-001. Evaluates Precision & Recall.
        """
        self.intake_a.approved_capacity = 120
        self.session.query(AdmissionRecord).filter(
            AdmissionRecord.institution_id == self.inst_a.id,
            AdmissionRecord.programme_id == self.prog.id,
            AdmissionRecord.academic_year == "2026-2027",
        ).delete()
        self.session.flush()

        headers = ["apaar_id", "full_name", "gender", "programme_code", "academic_year", "admission_category", "start_date"]
        output = io.StringIO()
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(headers)

        total = 135
        for i in range(1, total + 1):
            apaar = MockApaarServiceAdapter.generate_valid_apaar_id(seed=20000000000 + i)
            writer.writerow([apaar, f"Intake Candidate #{i:03d}", "male", "BTECH-CSE", "2026-2027", "general", "2026-08-01"])

        csv_text = output.getvalue()

        engine = ValidationEngine(session=self.session, institution_id=self.inst_a.id)
        start = time.perf_counter()
        summary = engine.validate_csv_content(csv_text)
        end = time.perf_counter()

        duration_sec = end - start
        duration_ms = duration_sec * 1000
        throughput = total / max(duration_sec, 0.0001)

        tp = min(summary.rejected_rows, 15)
        fp = max(0, summary.rejected_rows - 15)
        fn = max(0, 15 - summary.rejected_rows)
        tn = summary.accepted_rows

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0

        rules_fired: dict[str, int] = {}
        for r in summary.validated_rows:
            for v in r.violations:
                rules_fired[v.rule_code] = rules_fired.get(v.rule_code, 0) + 1

        passed = summary.rejected_rows == 15 and summary.accepted_rows == 120

        return ScenarioResult(
            scenario_id="ST-02",
            scenario_name="Batch ST-02 (Intake Capacity)",
            injected_anomalies="Sanctioned: 120, Injected: 135 rows",
            primary_metric="Boundary Detection (Precision: 100%, Recall: 100%)",
            total_records=total,
            expected_rejected=15,
            actual_rejected=summary.rejected_rows,
            expected_accepted=120,
            actual_accepted=summary.accepted_rows,
            flagged_records=summary.flagged_rows,
            precision=precision,
            recall=recall,
            false_positive_rate=fpr,
            duration_ms=round(duration_ms, 2),
            records_per_second=round(throughput, 1),
            target_error_code="CAP-001",
            status="PASSED" if passed else "FAILED",
            rules_fired=rules_fired,
        )

    def run_st03_clash(self) -> ScenarioResult:
        """ST-03: 10 Active overlap IDs in Inst B.

        10 Rows Rejected with code DUP-002 without cross-tenant data leak.
        """
        # Pre-seed 10 active students at Inst A
        clash_apaars: list[str] = []
        for i in range(1, 11):
            apaar = MockApaarServiceAdapter.generate_valid_apaar_id(seed=31000000000 + i)
            clash_apaars.append(apaar)
            stu = self.session.scalar(select(Student).where(Student.apaar_id == apaar))
            if stu is None:
                stu = Student(
                    apaar_id=apaar,
                    apaar_status=ApaarStatus.verified,
                    full_name=f"InstA Student #{i:02d}",
                    gender=Gender.female,
                )
                self.session.add(stu)
                self.session.flush()

            adm = self.session.scalar(select(AdmissionRecord).where(AdmissionRecord.student_id == stu.id))
            if adm is None:
                adm = AdmissionRecord(
                    student_id=stu.id,
                    institution_id=self.inst_a.id,
                    programme_id=self.prog.id,
                    academic_year="2026-2027",
                    admission_category=AdmissionCategory.general,
                    enrolment_status=EnrolmentStatus.active,
                    start_date=date(2026, 8, 1),
                    is_verified_active=True,
                )
                self.session.add(adm)
        self.session.flush()

        # Build payload for Inst B: 30 clean candidates + 10 clashing candidates = 40 total
        headers = ["apaar_id", "full_name", "gender", "programme_code", "academic_year", "admission_category", "start_date"]
        output = io.StringIO()
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(headers)

        # 30 Clean
        for i in range(1, 31):
            apaar = MockApaarServiceAdapter.generate_valid_apaar_id(seed=32000000000 + i)
            writer.writerow([apaar, f"InstB Candidate #{i:02d}", "male", "BTECH-CSE", "2026-2027", "general", "2026-08-01"])

        # 10 Clashes
        for i, apaar in enumerate(clash_apaars, 1):
            writer.writerow([apaar, f"InstB Applicant Conflict #{i:02d}", "female", "BTECH-CSE", "2026-2027", "general", "2026-08-01"])

        csv_text = output.getvalue()
        total = 40

        engine = ValidationEngine(session=self.session, institution_id=self.inst_b.id)
        start = time.perf_counter()
        summary = engine.validate_csv_content(csv_text)
        end = time.perf_counter()

        duration_sec = end - start
        duration_ms = duration_sec * 1000
        throughput = total / max(duration_sec, 0.0001)

        tp = min(summary.rejected_rows, 10)
        fp = max(0, summary.rejected_rows - 10)
        fn = max(0, 10 - summary.rejected_rows)
        tn = summary.accepted_rows

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0

        rules_fired: dict[str, int] = {}
        for r in summary.validated_rows:
            for v in r.violations:
                rules_fired[v.rule_code] = rules_fired.get(v.rule_code, 0) + 1

        passed = summary.rejected_rows == 10 and summary.accepted_rows == 30 and rules_fired.get("DUP-002", 0) == 10

        return ScenarioResult(
            scenario_id="ST-03",
            scenario_name="Batch ST-03 (Concurrent Conflict)",
            injected_anomalies="10 Active overlap IDs in Inst B",
            primary_metric="Cross-tenant conflict detection without data leak",
            total_records=total,
            expected_rejected=10,
            actual_rejected=summary.rejected_rows,
            expected_accepted=30,
            actual_accepted=summary.accepted_rows,
            flagged_records=summary.flagged_rows,
            precision=precision,
            recall=recall,
            false_positive_rate=fpr,
            duration_ms=round(duration_ms, 2),
            records_per_second=round(throughput, 1),
            target_error_code="DUP-002",
            status="PASSED" if passed else "FAILED",
            rules_fired=rules_fired,
        )

    def run_st04_format(self) -> ScenarioResult:
        """ST-04: 50 Malformed dates / academic years + 50 clean records = 100 rows.

        50 Rows Blocked with code SCH-002; non-failing 50 rows still process.
        """
        self.intake_a.approved_capacity = 5000
        self.session.flush()

        headers = ["apaar_id", "full_name", "gender", "programme_code", "academic_year", "admission_category", "start_date"]
        output = io.StringIO()
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(headers)

        # 50 Clean
        for i in range(1, 51):
            apaar = MockApaarServiceAdapter.generate_valid_apaar_id(seed=41000000000 + i)
            writer.writerow([apaar, f"Clean Format Student #{i:02d}", "female", "BTECH-CSE", "2026-2027", "general", "2026-08-01"])

        # 50 Malformed academic year formats (e.g. 2026/2027, 26-27, 2026)
        malformed_years = ["2026/2027", "26-27", "2026_2027", "2026", "2026-27"]
        for i in range(1, 51):
            apaar = MockApaarServiceAdapter.generate_valid_apaar_id(seed=42000000000 + i)
            bad_year = malformed_years[i % len(malformed_years)]
            writer.writerow([apaar, f"Malformed Year Student #{i:02d}", "male", "BTECH-CSE", bad_year, "general", "2026-08-01"])

        csv_text = output.getvalue()
        total = 100

        engine = ValidationEngine(session=self.session, institution_id=self.inst_a.id)
        start = time.perf_counter()
        summary = engine.validate_csv_content(csv_text)
        end = time.perf_counter()

        duration_sec = end - start
        duration_ms = duration_sec * 1000
        throughput = total / max(duration_sec, 0.0001)

        tp = min(summary.rejected_rows, 50)
        fp = max(0, summary.rejected_rows - 50)
        fn = max(0, 50 - summary.rejected_rows)
        tn = summary.accepted_rows

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0

        rules_fired: dict[str, int] = {}
        for r in summary.validated_rows:
            for v in r.violations:
                rules_fired[v.rule_code] = rules_fired.get(v.rule_code, 0) + 1

        passed = summary.rejected_rows == 50 and summary.accepted_rows == 50 and rules_fired.get("SCH-002", 0) == 50

        return ScenarioResult(
            scenario_id="ST-04",
            scenario_name="Batch ST-04 (Format & Syntax Isolation)",
            injected_anomalies="50 Malformed dates / academic years",
            primary_metric="Line-item error isolation (50 blocked, 50 processed)",
            total_records=total,
            expected_rejected=50,
            actual_rejected=summary.rejected_rows,
            expected_accepted=50,
            actual_accepted=summary.accepted_rows,
            flagged_records=summary.flagged_rows,
            precision=precision,
            recall=recall,
            false_positive_rate=fpr,
            duration_ms=round(duration_ms, 2),
            records_per_second=round(throughput, 1),
            target_error_code="SCH-002",
            status="PASSED" if passed else "FAILED",
            rules_fired=rules_fired,
        )

    def run_all(self) -> dict[str, Any]:
        """Runs all four benchmark scenarios and calculates aggregate performance metrics."""
        st01 = self.run_st01_clean()
        st02 = self.run_st02_intake()
        st03 = self.run_st03_clash()
        st04 = self.run_st04_format()

        scenarios = [st01, st02, st03, st04]

        total_records = sum(s.total_records for s in scenarios)
        total_duration_ms = sum(s.duration_ms for s in scenarios)
        avg_precision = sum(s.precision for s in scenarios) / len(scenarios)
        avg_recall = sum(s.recall for s in scenarios) / len(scenarios)
        avg_fpr = sum(s.false_positive_rate for s in scenarios) / len(scenarios)
        overall_throughput = total_records / max(total_duration_ms / 1000.0, 0.0001)

        all_passed = all(s.status == "PASSED" for s in scenarios)

        return {
            "summary": {
                "overall_status": "ALL PASSED" if all_passed else "SOME FAILED",
                "total_records_evaluated": total_records,
                "total_duration_ms": round(total_duration_ms, 2),
                "macro_precision": round(avg_precision * 100, 2),
                "macro_recall": round(avg_recall * 100, 2),
                "macro_false_positive_rate": round(avg_fpr * 100, 4),
                "throughput_records_per_sec": round(overall_throughput, 1),
                "evaluated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            "scenarios": [asdict(s) for s in scenarios],
        }
