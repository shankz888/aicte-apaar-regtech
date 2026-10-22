"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Building2,
  Users,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  ExternalLink,
  Filter,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";

interface OverviewSummary {
  total_institutions: number;
  total_programmes: number;
  sanctioned_capacity: number;
  verified_enrolments: number;
  utilization_rate_pct: number;
  flagged_batches_count: number;
  active_disputes_count: number;
}

interface CapacityRow {
  state: string;
  programme_code: string;
  programme_name: string;
  institutions_count: number;
  approved_capacity: number;
  actual_enrolments: number;
  nri_quota: number;
  nri_enrolments: number;
  utilization_pct: number;
  status: "normal" | "warning" | "breached";
}

interface ExceptionItem {
  batch_id: string;
  institution_name: string;
  aicte_id: string;
  state: string;
  original_filename: string;
  total_rows: number;
  rejected_rows: number;
  flagged_rows: number;
  rejection_rate_pct: number;
  status: string;
  created_at: string | null;
}

interface DisputeItem {
  dispute_id: string;
  batch_id: string;
  student_name: string;
  masked_apaar: string;
  claiming_institution: string;
  claiming_aicte_id: string;
  incumbent_institution: string;
  incumbent_aicte_id: string;
  programme_code: string;
  academic_year: string;
  dispute_status: string;
  resolution_action?: string | null;
  resolution_notes?: string | null;
  created_at: string;
}

export default function AdminOverviewPage() {
  const [summary, setSummary] = useState<OverviewSummary | null>(null);
  const [capacityRows, setCapacityRows] = useState<CapacityRow[]>([]);
  const [exceptionStream, setExceptionStream] = useState<ExceptionItem[]>([]);
  const [disputeQueue, setDisputeQueue] = useState<DisputeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState("ALL");

  // Dispute modal state
  const [selectedDispute, setSelectedDispute] = useState<DisputeItem | null>(null);
  const [resolutionAction, setResolutionAction] = useState("uphold_claimant");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [resolveFeedback, setResolveFeedback] = useState<string | null>(null);

  const fetchOverview = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/overview");
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setCapacityRows(data.capacity_breakdown || []);
        setExceptionStream(data.exception_stream || []);
        setDisputeQueue(data.duplicate_dispute_queue || []);
      }
    } catch (e) {
      console.error("Failed to fetch admin overview:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleResolveDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispute) return;

    setIsResolving(true);
    setResolveFeedback(null);

    try {
      const res = await fetch(`/api/admin/disputes/${selectedDispute.dispute_id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution_action: resolutionAction,
          notes: resolutionNotes || "Mediation recorded by AICTE Regulatory Officer.",
        }),
      });

      if (res.ok) {
        setResolveFeedback("Dispute successfully resolved and updated in registry.");
        // Update local state
        setDisputeQueue((prev) =>
          prev.map((d) =>
            d.dispute_id === selectedDispute.dispute_id
              ? {
                  ...d,
                  dispute_status: "resolved",
                  resolution_action: resolutionAction,
                  resolution_notes: resolutionNotes,
                }
              : d
          )
        );
        setTimeout(() => {
          setSelectedDispute(null);
          setResolveFeedback(null);
          setResolutionNotes("");
        }, 1200);
      } else {
        setResolveFeedback("Failed to resolve dispute. Please check regulatory action.");
      }
    } catch {
      setResolveFeedback("Network error communicating with dispute mediation service.");
    } finally {
      setIsResolving(false);
    }
  };

  const filteredCapacity = capacityRows.filter((r) =>
    stateFilter === "ALL" ? true : r.state.toLowerCase() === stateFilter.toLowerCase()
  );

  const uniqueStates = Array.from(new Set(capacityRows.map((r) => r.state)));

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top Title & Control Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
                REGULATORY COMMAND CONSOLE (SCREEN S-04)
              </span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-300">
                LIVE AUDIT ACTIVE
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight mt-1">
              AICTE Central Compliance & Capacity Reconciliation Matrix
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              National aggregate oversight across approved intake capacities, active concurrent clashes, and regulatory remediation manifests.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchOverview}
              disabled={isLoading}
              className="inline-flex items-center text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 px-3 py-2 rounded shadow-sm transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin text-blue-600" : "text-slate-500"}`} />
              Refresh Feeds
            </button>
            <Link
              href="/admin/benchmark"
              className="inline-flex items-center text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] px-3.5 py-2 rounded shadow-sm transition"
            >
              Run Benchmark Suite
            </Link>
          </div>
        </div>

        {/* Top 4 KPI Blocks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E2E8F0] p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Monitored Institutions
              </span>
              <Building2 className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-extrabold text-[#0F172A] mt-2">
              {summary ? summary.total_institutions.toLocaleString() : "..."}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center">
              <span className="text-[#15803D] font-semibold mr-1">100% compliant</span>
              institutions registered
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Enrolment vs Sanctioned Cap
              </span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-extrabold text-[#0F172A] mt-2">
              {summary
                ? `${summary.verified_enrolments.toLocaleString()} / ${summary.sanctioned_capacity.toLocaleString()}`
                : "..."}
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-[#1D4ED8] h-1.5 rounded-full"
                style={{ width: `${Math.min(100, summary?.utilization_rate_pct || 0)}%` }}
              />
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                National Capacity Utilization
              </span>
              <BarChart3 className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-extrabold text-[#0F172A] mt-2">
              {summary ? `${summary.utilization_rate_pct}%` : "..."}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Threshold ceiling: 100.0% max sanctioned
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Active Concurrent Disputes
              </span>
              <ShieldAlert className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-extrabold text-amber-700 mt-2">
              {summary ? summary.active_disputes_count : "..."}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Rule DUP-002 cross-institutional clashes
            </div>
          </div>
        </div>

        {/* Module 1: National Intake Capacity vs Actual Enrolments */}
        <section className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-[#0F172A] flex items-center">
                <BarChart3 className="w-4 h-4 mr-2 text-blue-600" />
                National Intake Capacity vs. Actual Enrolments
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Grouped state-level and programme breakdown. Enforces CAP-001 (Intake Quota) and CAP-002 (NRI Cap).
              </p>
            </div>

            {/* Filter by State */}
            <div className="flex items-center space-x-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">All Jurisdictions ({uniqueStates.length} States)</option>
                {uniqueStates.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-[#E2E8F0] text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">State / Territory</th>
                  <th className="py-3 px-4">Programme</th>
                  <th className="py-3 px-4 text-center">Colleges</th>
                  <th className="py-3 px-4 text-right">Sanctioned Cap</th>
                  <th className="py-3 px-4 text-right">Enrolled Count</th>
                  <th className="py-3 px-4 text-right">NRI Quota / Enr</th>
                  <th className="py-3 px-4 text-right">Utilization %</th>
                  <th className="py-3 px-4 text-center">Compliance Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredCapacity.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No matching capacity records found.
                    </td>
                  </tr>
                ) : (
                  filteredCapacity.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-semibold text-[#0F172A]">{item.state}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{item.programme_code}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">
                          {item.programme_name}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-700">
                        {item.institutions_count}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-slate-800">
                        {item.approved_capacity.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {item.actual_enrolments.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {item.nri_enrolments} / {item.nri_quota}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        <span
                          className={
                            item.status === "breached"
                              ? "text-[#B91C1C]"
                              : item.status === "warning"
                              ? "text-[#B45309]"
                              : "text-[#15803D]"
                          }
                        >
                          {item.utilization_pct}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.status === "breached" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]">
                            CAP OVERRUN
                          </span>
                        ) : item.status === "warning" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]">
                            NEAR CAPACITY
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0]">
                            NORMAL
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Lower Two Columns: Exception Stream & Dispute Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Module 2: Real-time Exception Stream */}
          <section className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-[#0F172A] flex items-center">
                  <ShieldAlert className="w-4 h-4 mr-2 text-red-600" />
                  Real-Time Exception Stream
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Institutional batches with &gt;5% rejection rates or blocking compliance infractions.
                </p>
              </div>
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded">
                {exceptionStream.length} Flagged
              </span>
            </div>

            <div className="space-y-3">
              {exceptionStream.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No active batch exceptions detected.
                </div>
              ) : (
                exceptionStream.map((item) => (
                  <div
                    key={item.batch_id}
                    className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-900">{item.institution_name}</span>
                        <span className="text-[10px] font-mono text-slate-500">#{item.aicte_id}</span>
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded">
                          {item.state}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-1">
                        File: {item.original_filename} • {item.total_rows} total rows
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <div className="font-mono font-bold text-red-700 text-sm">
                          {item.rejected_rows} Rejected ({item.rejection_rate_pct}%)
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {item.created_at ? new Date(item.created_at).toLocaleTimeString() : "Just now"}
                        </div>
                      </div>

                      <Link
                        href={`/institution/batches/${item.batch_id}`}
                        title="Inspect Batch Remediation Manifest"
                        className="p-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-600 hover:text-slate-900 transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Module 3: Duplicate Dispute Queue (DUP-002) */}
          <section className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-[#0F172A] flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-2 text-amber-600" />
                  Duplicate Dispute Queue (Rule DUP-002)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cross-institutional active concurrent enrolment conflicts requiring AICTE mediation.
                </p>
              </div>
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded">
                {disputeQueue.length} Active
              </span>
            </div>

            <div className="space-y-3">
              {disputeQueue.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No cross-institutional disputes currently pending mediation.
                </div>
              ) : (
                disputeQueue.map((dispute) => (
                  <div
                    key={dispute.dispute_id}
                    className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-900">{dispute.student_name}</span>
                        <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                          APAAR: {dispute.masked_apaar}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          dispute.dispute_status === "resolved"
                            ? "bg-green-100 text-green-800 border border-green-200"
                            : "bg-amber-100 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {dispute.dispute_status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded border border-slate-100">
                      <div>
                        <div className="text-slate-400 uppercase text-[9px] font-semibold">Claimant (New Enrolment)</div>
                        <div className="font-semibold text-slate-800 truncate">{dispute.claiming_institution}</div>
                        <div className="text-[10px] font-mono text-slate-500">#{dispute.claiming_aicte_id}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 uppercase text-[9px] font-semibold">Incumbent (Active Prior Record)</div>
                        <div className="font-semibold text-slate-800 truncate">{dispute.incumbent_institution}</div>
                        <div className="text-[10px] font-mono text-slate-500">#{dispute.incumbent_aicte_id}</div>
                      </div>
                    </div>

                    {dispute.resolution_action && (
                      <div className="text-[11px] text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200 font-mono">
                        Action: <strong>{dispute.resolution_action}</strong> • Notes: {dispute.resolution_notes || "None"}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-400 font-mono">
                        Programme: {dispute.programme_code} ({dispute.academic_year})
                      </span>
                      {dispute.dispute_status !== "resolved" && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDispute(dispute);
                            setResolutionNotes("");
                            setResolveFeedback(null);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition"
                        >
                          Mediate Conflict
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Dispute Mediation Modal Drawer */}
      {selectedDispute && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Regulatory Dispute Mediation</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Resolution determination for concurrent enrolment conflict (Rule DUP-002)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDispute(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {resolveFeedback && (
              <div
                className={`p-3 text-xs rounded border ${
                  resolveFeedback.includes("successfully")
                    ? "bg-green-50 text-green-800 border-green-200"
                    : "bg-red-50 text-red-800 border-red-200"
                }`}
              >
                {resolveFeedback}
              </div>
            )}

            <form onSubmit={handleResolveDispute} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Conflict Record</label>
                <div className="bg-slate-50 p-3 rounded border border-slate-200 font-mono text-[11px] space-y-1">
                  <div>
                    Student: <strong>{selectedDispute.student_name}</strong> (APAAR: {selectedDispute.masked_apaar})
                  </div>
                  <div>Claiming: {selectedDispute.claiming_institution}</div>
                  <div>Incumbent: {selectedDispute.incumbent_institution}</div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Regulatory Determination</label>
                <select
                  value={resolutionAction}
                  onChange={(e) => setResolutionAction(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="uphold_claimant">
                    Uphold Claimant (Confirm Transfer / Release Prior Record)
                  </option>
                  <option value="uphold_incumbent">
                    Uphold Incumbent (Cancel New Enrolment / Enforce Prior Record)
                  </option>
                  <option value="require_noc">
                    Require Official Transfer Certificate / NOC Submission
                  </option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Statutory Remarks / Evidence Reference</label>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g., Verified TC No. 2026-MH-4921 issued on 2026-08-01. Prior enrolment cleared."
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedDispute(null)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResolving}
                  className="px-4 py-1.5 rounded bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-medium transition shadow-sm"
                >
                  {isResolving ? "Recording Decision..." : "Execute Regulatory Mediation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
