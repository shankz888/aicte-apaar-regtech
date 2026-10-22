"""Tests for AICTE Central Compliance Dashboard and Dispute Mediation API."""

import pytest
from fastapi.testclient import TestClient


def test_admin_overview_endpoint(client: TestClient, test_setup: dict):
    """Verify GET /api/admin/overview returns aggregated regulatory compliance data."""
    response = client.get("/api/admin/overview")
    assert response.status_code == 200
    data = response.json()

    # 1. Summary Block
    assert "summary" in data
    summary = data["summary"]
    assert "total_institutions" in summary
    assert "total_programmes" in summary
    assert "sanctioned_capacity" in summary
    assert "verified_enrolments" in summary
    assert "utilization_rate_pct" in summary
    assert "active_disputes_count" in summary
    assert summary["total_institutions"] >= 2
    assert summary["sanctioned_capacity"] > 0

    # 2. Capacity Reconciliation Breakdown
    assert "capacity_breakdown" in data
    breakdown = data["capacity_breakdown"]
    assert len(breakdown) > 0
    first_item = breakdown[0]
    assert "state" in first_item
    assert "programme_code" in first_item
    assert "approved_capacity" in first_item
    assert "actual_enrolments" in first_item
    assert "utilization_pct" in first_item
    assert first_item["status"] in {"normal", "warning", "breached"}

    # 3. Exception Stream
    assert "exception_stream" in data
    stream = data["exception_stream"]
    assert len(stream) > 0
    first_stream = stream[0]
    assert "batch_id" in first_stream
    assert "institution_name" in first_stream
    assert "rejection_rate_pct" in first_stream

    # 4. Duplicate Dispute Queue
    assert "duplicate_dispute_queue" in data
    disputes = data["duplicate_dispute_queue"]
    assert len(disputes) > 0
    first_dispute = disputes[0]
    assert "dispute_id" in first_dispute
    assert "claiming_institution" in first_dispute
    assert "incumbent_institution" in first_dispute
    assert "dispute_status" in first_dispute


def test_resolve_dispute_endpoint(client: TestClient, test_setup: dict):
    """Verify POST /api/admin/disputes/{id}/resolve allows regulatory mediation."""
    # 1. Get current dispute id
    overview = client.get("/api/admin/overview").json()
    disputes = overview["duplicate_dispute_queue"]
    target_dispute = disputes[0]
    dispute_id = target_dispute["dispute_id"]

    # 2. Resolve dispute with 'uphold_claimant'
    resolve_resp = client.post(
        f"/api/admin/disputes/{dispute_id}/resolve",
        json={
            "resolution_action": "uphold_claimant",
            "notes": "Verified official transfer certificate and NOC dated 2026-08-15.",
        },
    )
    assert resolve_resp.status_code == 200
    res_data = resolve_resp.json()
    assert res_data["status"] == "resolved"
    assert res_data["resolution_action"] == "uphold_claimant"

    # 3. Verify status changed in overview
    updated_overview = client.get("/api/admin/overview").json()
    updated_disputes = updated_overview["duplicate_dispute_queue"]
    matched = next((d for d in updated_disputes if d["dispute_id"] == dispute_id), None)
    assert matched is not None
    assert matched["dispute_status"] == "resolved"
    assert matched["resolution_action"] == "uphold_claimant"


def test_resolve_dispute_invalid_action(client: TestClient, test_setup: dict):
    """Verify invalid dispute resolution action returns 400 Bad Request."""
    response = client.post(
        "/api/admin/disputes/any-id/resolve",
        json={"resolution_action": "invalid_action_name", "notes": ""},
    )
    assert response.status_code == 400
    assert "Invalid resolution_action" in response.json()["detail"]
