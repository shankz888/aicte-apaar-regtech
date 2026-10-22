"""Synthetic Fault-Injection Benchmark Suite API (PRD Section 8)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.benchmark_engine import BenchmarkSuiteEngine

router = APIRouter(prefix="/api/benchmark", tags=["benchmark"])

SCENARIOS_META = [
    {
        "scenario_id": "ST-01",
        "name": "Batch ST-01 (Clean Baseline)",
        "injected_anomalies": "0 faults / 2,000 records",
        "expected_detections": "0 Rejected, 2,000 Accepted",
        "primary_metric": "False Positive Rate (<0.01%)",
        "target_error_code": "None",
    },
    {
        "scenario_id": "ST-02",
        "name": "Batch ST-02 (Intake Capacity Boundary)",
        "injected_anomalies": "Sanctioned: 120, Injected: 135 rows",
        "expected_detections": "15 Rows Rejected with code CAP-001",
        "primary_metric": "Exact boundary cap detection (Precision: 100%, Recall: 100%)",
        "target_error_code": "CAP-001",
    },
    {
        "scenario_id": "ST-03",
        "name": "Batch ST-03 (Cross-Tenant Conflict)",
        "injected_anomalies": "10 Active overlap IDs in Inst B",
        "expected_detections": "10 Rows Rejected with code DUP-002",
        "primary_metric": "Cross-tenant conflict detection without data leak",
        "target_error_code": "DUP-002",
    },
    {
        "scenario_id": "ST-04",
        "name": "Batch ST-04 (Format & Date Syntax)",
        "injected_anomalies": "50 Malformed dates and bad headers",
        "expected_detections": "50 Rows Blocked with code SCH-002",
        "primary_metric": "Line-item error isolation; non-failing rows still process",
        "target_error_code": "SCH-002",
    },
]


@router.get("/scenarios")
def list_scenarios() -> list[dict]:
    """Returns metadata for all available synthetic fault-injection benchmark scenarios."""
    return SCENARIOS_META


@router.post("/run-all")
def run_all_benchmarks(
    db: Session = Depends(get_db),
) -> dict:
    """Executes all 4 synthetic benchmark scenarios and returns aggregate metrics."""
    engine = BenchmarkSuiteEngine(session=db)
    results = engine.run_all()
    return results


@router.post("/run/{scenario_id}")
def run_single_benchmark(
    scenario_id: str,
    db: Session = Depends(get_db),
) -> dict:
    """Executes a single synthetic benchmark scenario by ID (ST-01, ST-02, ST-03, ST-04)."""
    engine = BenchmarkSuiteEngine(session=db)
    sid = scenario_id.upper().strip()

    if sid == "ST-01":
        res = engine.run_st01_clean()
    elif sid == "ST-02":
        res = engine.run_st02_intake()
    elif sid == "ST-03":
        res = engine.run_st03_clash()
    elif sid == "ST-04":
        res = engine.run_st04_format()
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown scenario ID '{scenario_id}'. Must be one of ST-01, ST-02, ST-03, ST-04.",
        )

    from dataclasses import asdict
    return asdict(res)
