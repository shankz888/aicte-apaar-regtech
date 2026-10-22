"""Integration tests for Synthetic Fault-Injection Benchmark Suite API."""

from fastapi.testclient import TestClient


def test_list_benchmark_scenarios(client: TestClient) -> None:
    response = client.get("/api/benchmark/scenarios")
    assert response.status_code == 200
    scenarios = response.json()
    assert len(scenarios) == 4
    scenario_ids = [s["scenario_id"] for s in scenarios]
    assert scenario_ids == ["ST-01", "ST-02", "ST-03", "ST-04"]


def test_run_single_benchmark_st01(client: TestClient) -> None:
    response = client.post("/api/benchmark/run/ST-01")
    assert response.status_code == 200
    data = response.json()
    assert data["scenario_id"] == "ST-01"
    assert data["total_records"] == 2000
    assert data["actual_rejected"] == 0
    assert data["actual_accepted"] == 2000
    assert data["false_positive_rate"] == 0.0
    assert data["status"] == "PASSED"
    assert data["records_per_second"] > 1000


def test_run_single_benchmark_st02(client: TestClient) -> None:
    response = client.post("/api/benchmark/run/ST-02")
    assert response.status_code == 200
    data = response.json()
    assert data["scenario_id"] == "ST-02"
    assert data["total_records"] == 135
    assert data["actual_rejected"] == 15
    assert data["actual_accepted"] == 120
    assert data["precision"] == 1.0
    assert data["recall"] == 1.0
    assert data["target_error_code"] == "CAP-001"
    assert data["status"] == "PASSED"


def test_run_single_benchmark_st03(client: TestClient) -> None:
    response = client.post("/api/benchmark/run/ST-03")
    assert response.status_code == 200
    data = response.json()
    assert data["scenario_id"] == "ST-03"
    assert data["actual_rejected"] == 10
    assert data["actual_accepted"] == 30
    assert data["precision"] == 1.0
    assert data["recall"] == 1.0
    assert data["target_error_code"] == "DUP-002"
    assert data["status"] == "PASSED"


def test_run_single_benchmark_st04(client: TestClient) -> None:
    response = client.post("/api/benchmark/run/ST-04")
    assert response.status_code == 200
    data = response.json()
    assert data["scenario_id"] == "ST-04"
    assert data["total_records"] == 100
    assert data["actual_rejected"] == 50
    assert data["actual_accepted"] == 50
    assert data["target_error_code"] == "SCH-002"
    assert data["status"] == "PASSED"


def test_run_all_benchmarks(client: TestClient) -> None:
    response = client.post("/api/benchmark/run-all")
    assert response.status_code == 200
    data = response.json()

    summary = data["summary"]
    assert summary["overall_status"] == "ALL PASSED"
    assert summary["total_records_evaluated"] == 2275  # 2000 + 135 + 40 + 100
    assert summary["macro_precision"] == 100.0
    assert summary["macro_recall"] == 100.0
    assert summary["macro_false_positive_rate"] == 0.0
    assert summary["throughput_records_per_sec"] > 1000

    scenarios = data["scenarios"]
    assert len(scenarios) == 4
    for sc in scenarios:
        assert sc["status"] == "PASSED"
