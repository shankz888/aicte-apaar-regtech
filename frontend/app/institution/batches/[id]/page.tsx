"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  ArrowLeft,
  FileCode,
  ShieldAlert,
  GraduationCap,
  RefreshCw,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { StatusBadge } from "@/components/ui/status-badge";

interface ViolationItem {
  rule_code: string;
  severity: "blocking" | "warning" | "info";
  status: "accepted" | "flagged" | "rejected";
  rule_description: string;
  evidence_payload: Record<string, unknown>;
  remediation_hint: string;
}

interface BatchLineItem {
  row_index: number;
  apaar_id: string | null;
  full_name: string;
  gender: string;
  programme_code: string;
  academic_year: string;
  admission_category: string;
  start_date: string;
  end_date: string | null;
  status: "accepted" | "flagged" | "rejected";
  violations: ViolationItem[];
}

interface BatchData {
  id: string;
  institution_id: string;
  original_filename: string;
  total_rows: number;
  accepted_rows: number;
  flagged_rows: number;
  rejected_rows: number;
  status: string;
  created_at: string | null;
  items: BatchLineItem[];
}

type FilterOutcome = "all" | "rejected" | "flagged" | "accepted";

export default function BatchRemediationConsolePage({
  params,
}: {
  params: { id: string };
}) {
  const routeParams = useParams();
  const batchId = params?.id || (routeParams?.id as string) || "";

  const [batch, setBatch] = useState<BatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [outcomeFilter, setOutcomeFilter] = useState<FilterOutcome>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRow, setSelectedRow] = useState<BatchLineItem | null>(null);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  useEffect(() => {
    async function fetchBatchDetails() {
      try {
        setLoading(true);
        const res = await fetch(`/api/batches/${batchId}`);
        if (!res.ok) {
          throw new Error(`Failed to load batch: HTTP ${res.status}`);
        }
        const data: BatchData = await res.json();
        setBatch(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error loading batch data.");
      } finally {
        setLoading(false);
      }
    }
    fetchBatchDetails();
  }, [batchId]);

  // Handle escape key to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedRow(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleDownloadAnnotatedCsv = async () => {
    try {
      setDownloadingCsv(true);
      const res = await fetch(`/api/batches/${batchId}/annotated-csv`);
      if (!res.ok) {
        throw new Error("Failed to generate annotated CSV remediation file.");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `annotated_${batch?.original_filename || "batch.csv"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloadingCsv(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!batch?.items) return [];

    return batch.items.filter((item) => {
      // Outcome filter
      if (outcomeFilter !== "all" && item.status !== outcomeFilter) {
        return false;
      }

      // Search query (Student Name, APAAR ID, Programme, Rule Code)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = item.full_name.toLowerCase().includes(query);
        const matchesApaar = item.apaar_id?.toLowerCase().includes(query) || false;
        const matchesProg = item.programme_code.toLowerCase().includes(query);
        const matchesRule = item.violations.some((v) =>
          v.rule_code.toLowerCase().includes(query)
        );
        return matchesName || matchesApaar || matchesProg || matchesRule;
      }

      return true;
    });
  }, [batch?.items, outcomeFilter, searchQuery]);

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-violet-200 mx-auto mb-4" />
          <h2 className="text-sm font-semibold text-white">
            Retrieving Batch Verification Results...
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Batch Reference ID: {batchId}
          </p>
        </div>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="min-h-screen bg-transparent">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="glass-panel max-w-lg mx-auto bg-white/[0.045] border border-rose-300/25 rounded p-6 shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)] text-center">
            <XCircle className="w-10 h-10 text-rose-200 mx-auto mb-3" />
            <h2 className="text-base font-bold text-white mb-1">
              Unable to Retrieve Batch Record
            </h2>
            <p className="text-xs text-slate-300 mb-6">{error || "Batch not found."}</p>
            <Link
              href="/institution/submit"
              className="inline-flex items-center text-xs font-semibold text-white bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 specular-button hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 px-4 py-2 rounded shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Return to Submission Workspace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 workspace-main">
        {/* Navigation Breadcrumb & Title */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-mono uppercase text-slate-400 mb-1">
              <Link href="/institution/submit" className="hover:text-slate-200 transition-colors">
                SUBMISSION WORKSPACE
              </Link>
              <span>/</span>
              <span className="text-slate-200 font-semibold">BATCH RESULTS #{batch.id.slice(0, 8)}</span>
            </div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Batch Review & Line-Item Remediation Console
              </h1>
              <StatusBadge status={batch.status} size="sm" />
            </div>
            <div className="text-xs text-slate-400 mt-1 font-mono flex items-center space-x-3">
              <span>File: {batch.original_filename}</span>
              <span> | </span>
              <span>Submitted: {batch.created_at ? new Date(batch.created_at).toLocaleString() : "Just now"}</span>
            </div>
          </div>

          {/* Primary Action: Download Annotated Error CSV */}
          <div className="flex items-center space-x-3">
            <Link
              href="/institution/submit"
              className="inline-flex items-center text-xs font-medium text-slate-200 bg-white/[0.045] hover:bg-white/[0.08] px-3.5 py-2 rounded transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Upload New Batch
            </Link>

            <button
              onClick={handleDownloadAnnotatedCsv}
              disabled={downloadingCsv}
              className="inline-flex items-center text-xs font-bold text-white bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 specular-button hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 px-4 py-2 rounded shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)] transition-colors disabled:opacity-50"
            >
              {downloadingCsv ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating Manifest...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Download Annotated Correction CSV
                </>
              )}
            </button>
          </div>
        </div>

        {/* Top 4 KPI Summary Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Card 1: Total Submitted */}
          <div className="glass-panel rounded p-4 shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold mb-1">
              Total Submitted
            </div>
            <div className="text-2xl font-extrabold text-white font-mono">
              {batch.total_rows.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Enrolment records ingested
            </div>
          </div>

          {/* Card 2: Accepted (Green) */}
          <div className="bg-emerald-400/10 border border-emerald-300/25 rounded p-4 shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
            <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-200 font-semibold mb-1 flex items-center justify-between">
              <span>Accepted Enrolments</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-200 font-mono">
              {batch.accepted_rows.toLocaleString()}
            </div>
            <div className="text-[11px] text-emerald-200 mt-1 font-medium">
              Promoted to central register
            </div>
          </div>

          {/* Card 3: Flagged Warnings (Amber) */}
          <div className="bg-amber-300/10 border border-amber-200/25 rounded p-4 shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
            <div className="text-[11px] font-mono uppercase tracking-wider text-amber-100 font-semibold mb-1 flex items-center justify-between">
              <span>Flagged Warnings</span>
              <AlertTriangle className="w-4 h-4 text-amber-100" />
            </div>
            <div className="text-2xl font-extrabold text-amber-100 font-mono">
              {batch.flagged_rows.toLocaleString()}
            </div>
            <div className="text-[11px] text-amber-100 mt-1 font-medium">
              Voluntary APAAR missing / non-fatal
            </div>
          </div>

          {/* Card 4: Rejected / Blocking (Red) */}
          <div className="bg-rose-400/10 border border-rose-300/25 rounded p-4 shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
            <div className="text-[11px] font-mono uppercase tracking-wider text-rose-200 font-semibold mb-1 flex items-center justify-between">
              <span>Rejected / Blocking</span>
              <XCircle className="w-4 h-4 text-rose-200" />
            </div>
            <div className="text-2xl font-extrabold text-rose-200 font-mono">
              {batch.rejected_rows.toLocaleString()}
            </div>
            <div className="text-[11px] text-rose-200 mt-1 font-medium">
              Quota breaches & clashes blocked
            </div>
          </div>
        </div>

        {/* Action & Filter Bar */}
        <div className="glass-panel rounded p-3 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
          {/* Outcome Filter Tabs */}
          <div className="flex items-center space-x-1 bg-white/[0.07] p-1 rounded border border-violet-200/10 text-xs">
            <button
              onClick={() => setOutcomeFilter("all")}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                outcomeFilter === "all"
                  ? "bg-white/[0.045] text-white shadow-xs font-semibold"
                  : "text-slate-300 hover:text-slate-100"
              }`}
            >
              All Records ({batch.total_rows})
            </button>
            <button
              onClick={() => setOutcomeFilter("rejected")}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                outcomeFilter === "rejected"
                  ? "bg-rose-400/10 text-rose-200 shadow-xs font-semibold border border-rose-300/25"
                  : "text-slate-300 hover:text-slate-100"
              }`}
            >
              Blocking Errors Only ({batch.rejected_rows})
            </button>
            <button
              onClick={() => setOutcomeFilter("flagged")}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                outcomeFilter === "flagged"
                  ? "bg-amber-300/10 text-amber-100 shadow-xs font-semibold border border-amber-200/25"
                  : "text-slate-300 hover:text-slate-100"
              }`}
            >
              Warnings ({batch.flagged_rows})
            </button>
            <button
              onClick={() => setOutcomeFilter("accepted")}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                outcomeFilter === "accepted"
                  ? "bg-emerald-400/10 text-emerald-200 shadow-xs font-semibold border border-emerald-300/25"
                  : "text-slate-300 hover:text-slate-100"
              }`}
            >
              Accepted ({batch.accepted_rows})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search student, APAAR, rule..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs glass-control rounded pl-9 pr-3 py-2 text-slate-100 focus:outline-hidden focus:border-violet-300/60 focus:bg-white/10 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Virtualized / Inspection Grid Table */}
        <div className="glass-panel rounded overflow-hidden shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-violet-200/10 text-xs">
              <thead className="bg-white/[0.08]">
                <tr>
                  <th className="px-3 py-3 text-left font-mono text-slate-300 uppercase text-[11px] w-16">
                    Row #
                  </th>
                  <th className="px-3 py-3 text-left font-mono text-slate-300 uppercase text-[11px] w-48">
                    Student Identifiers
                  </th>
                  <th className="px-3 py-3 text-left font-mono text-slate-300 uppercase text-[11px] w-28">
                    Programme
                  </th>
                  <th className="px-3 py-3 text-left font-mono text-slate-300 uppercase text-[11px] w-28">
                    Category
                  </th>
                  <th className="px-3 py-3 text-left font-mono text-slate-300 uppercase text-[11px] w-28">
                    Validation Status
                  </th>
                  <th className="px-3 py-3 text-left font-mono text-slate-300 uppercase text-[11px] w-28">
                    Fired Rule
                  </th>
                  <th className="px-3 py-3 text-left font-mono text-slate-300 uppercase text-[11px]">
                    Actionable Reason / Remediation
                  </th>
                  <th className="px-3 py-3 text-right font-mono text-slate-300 uppercase text-[11px] w-20">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-200/10 bg-white/[0.045]">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      <div className="max-w-xs mx-auto">
                        <Filter className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                        <div className="text-xs font-semibold text-slate-200">
                          No Records Matching Filter Criteria
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          Try adjusting search terms or switching outcome filters.
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const primaryViolation = item.violations[0];
                    const isSelected = selectedRow?.row_index === item.row_index;

                    return (
                      <tr
                        key={item.row_index}
                        onClick={() => setSelectedRow(item)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-violet-400/10"
                            : item.status === "rejected"
                            ? "hover:bg-rose-400/10"
                            : item.status === "flagged"
                            ? "hover:bg-amber-300/10"
                            : "hover:bg-white/[0.035]"
                        }`}
                      >
                        <td className="px-3 py-3 font-mono text-slate-400 font-semibold">
                          #{item.row_index}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-100">
                            {item.full_name}
                          </div>
                          <div className="font-mono text-[11px] text-slate-400">
                            {item.apaar_id ? (
                              item.apaar_id
                            ) : (
                              <span className="text-amber-200 italic">No APAAR</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-200 font-medium">
                          {item.programme_code}
                        </td>
                        <td className="px-3 py-3 uppercase font-mono text-[11px] text-slate-200">
                          {item.admission_category}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={item.status} size="sm" />
                        </td>
                        <td className="px-3 py-3 font-mono font-bold text-xs">
                          {primaryViolation ? (
                            <span
                              className={
                                primaryViolation.severity === "blocking"
                                  ? "text-rose-200"
                                  : "text-amber-100"
                              }
                            >
                              {primaryViolation.rule_code}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">--</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-200">
                          {primaryViolation ? (
                            <div>
                              <span className="font-medium">
                                {primaryViolation.rule_description}
                              </span>
                              <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                                {primaryViolation.remediation_hint}
                              </div>
                            </div>
                          ) : (
                            <span className="text-emerald-200 font-medium flex items-center">
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Passed all deterministic regulatory checks
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRow(item);
                            }}
                            className="text-xs font-mono text-violet-200 hover:text-white hover:underline"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-white/[0.035] border-t border-violet-200/10 flex items-center justify-between text-xs text-slate-400">
            <span>
              Showing {filteredItems.length} of {batch.total_rows} total submissions
            </span>
            <span className="font-mono text-[11px]">
              Click any line-item to inspect JSON evidence and remediation instructions
            </span>
          </div>
        </div>
      </main>

      {/* Slide-Over Drawer (Record Remediation Panel) */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            onClick={() => setSelectedRow(null)}
            className="absolute inset-0 bg-slate-900/40 transition-opacity"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-lg bg-white/[0.045] border-l border-violet-200/10 shadow-2xl flex flex-col">
              {/* Drawer Header */}
              <div className="p-5 border-b border-violet-200/10 bg-white/[0.035] flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-slate-400">
                      ROW #{selectedRow.row_index}
                    </span>
                    <StatusBadge status={selectedRow.status} size="sm" />
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">
                    {selectedRow.full_name}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedRow(null)}
                  className="p-1 rounded text-slate-400 hover:text-slate-300 hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Enrolment Record Summary */}
                <div className="glass-control rounded p-4">
                  <div className="text-[11px] font-mono uppercase font-bold text-slate-400 mb-3 flex items-center">
                    <GraduationCap className="w-4 h-4 mr-1.5 text-slate-300" />
                    Enrolment Specifications
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block">APAAR Identifier:</span>
                      <span className="font-mono font-bold text-slate-100">
                        {selectedRow.apaar_id || "Voluntary Missing"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Programme Code:</span>
                      <span className="font-mono font-bold text-slate-100">
                        {selectedRow.programme_code}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Academic Year:</span>
                      <span className="font-mono text-slate-100">
                        {selectedRow.academic_year}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Admission Category:</span>
                      <span className="font-mono uppercase text-slate-100">
                        {selectedRow.admission_category}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Admission Start Date:</span>
                      <span className="font-mono text-slate-100">
                        {selectedRow.start_date}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Gender:</span>
                      <span className="capitalize text-slate-100">
                        {selectedRow.gender}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Validation Status & Fired Rules */}
                <div>
                  <div className="text-[11px] font-mono uppercase font-bold text-slate-400 mb-3 flex items-center">
                    <ShieldAlert className="w-4 h-4 mr-1.5 text-slate-300" />
                    Regulatory Engine Evaluation
                  </div>

                  {selectedRow.violations.length === 0 ? (
                    <div className="p-4 bg-emerald-400/10 border border-emerald-300/25 rounded">
                      <div className="flex items-center space-x-2 text-emerald-200 font-bold text-xs uppercase font-mono">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>All Compliance Checks Passed</span>
                      </div>
                      <p className="text-xs text-slate-200 mt-2">
                        This candidate record conforms to approved program intake limits, academic year syntax, and non-concurrent timeline requirements. Promoted directly to the AICTE central repository.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selectedRow.violations.map((violation, vIdx) => (
                        <div
                          key={vIdx}
                          className={`p-4 rounded border ${
                            violation.severity === "blocking"
                              ? "bg-rose-400/10 border-rose-300/25"
                              : "bg-amber-300/10 border-amber-200/25"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono font-bold text-xs text-slate-100">
                              Rule {violation.rule_code}
                            </span>
                            <StatusBadge status={violation.severity} size="sm" />
                          </div>

                          <div className="text-xs font-bold text-slate-100 mb-1">
                            {violation.rule_description}
                          </div>

                          {/* Actionable Remediation Instruction */}
                          <div className="glass-panel mt-3 p-2.5 bg-white/[0.045] rounded border border-violet-200/10">
                            <div className="text-[10px] font-mono uppercase font-bold text-slate-400 mb-0.5">
                              Remediation Directive:
                            </div>
                            <div className="text-xs text-slate-200 font-medium">
                              {violation.remediation_hint}
                            </div>
                          </div>

                          {/* Formatted JSON Evidence Payload */}
                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold flex items-center">
                                <FileCode className="w-3.5 h-3.5 mr-1 text-slate-400" />
                                Diagnostic Evidence Payload
                              </span>
                            </div>
                            <pre className="text-[11px] font-mono bg-[#190C29] text-slate-100 p-3 rounded overflow-x-auto border border-violet-200/10">
                              {JSON.stringify(violation.evidence_payload, null, 2)}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-violet-200/10 bg-white/[0.035] flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setSelectedRow(null)}
                  className="text-xs font-semibold text-slate-200 hover:text-slate-100 px-4 py-2 rounded border border-violet-200/10 hover:bg-white/[0.07] transition-colors"
                >
                  Close Panel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}





