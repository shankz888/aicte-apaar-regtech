"use client";

import React, { useState, useRef, ChangeEvent, DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  Download,
  ArrowRight,
  RefreshCw,
  Info,
  XCircle,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";

const MANDATORY_HEADERS = [
  "apaar_id",
  "full_name",
  "gender",
  "programme_code",
  "academic_year",
  "admission_category",
  "start_date",
];

interface PreCheckRow {
  index: number;
  data: Record<string, string>;
  isValid: boolean;
}

function parseClientCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (char === "\r") {
        if (nextChar === "\n") i++;
        currentRow.push(currentCell.trim());
        lines.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else if (char === "\n") {
        currentRow.push(currentCell.trim());
        lines.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    lines.push(currentRow);
  }

  const nonEmpty = lines.filter((r) => r.some((c) => c.length > 0));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  return { headers: nonEmpty[0], rows: nonEmpty.slice(1) };
}

export default function SubmissionWorkspacePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preCheckRows, setPreCheckRows] = useState<PreCheckRow[]>([]);
  const [missingHeaders, setMissingHeaders] = useState<string[]>([]);
  const [totalParsedRows, setTotalParsedRows] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<string>("");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isResettingBaseline, setIsResettingBaseline] = useState(false);

  const handleResetBaseline = async () => {
    try {
      setIsResettingBaseline(true);
      setErrorNotice(null);
      const res = await fetch("/api/admin/reset-baseline", { method: "POST" });
      if (res.ok) {
        setSuccessNotice("Statutory baseline restored: Apex Institute intake capacity reset to 0/120.");
        handleReset();
        setTimeout(() => setSuccessNotice(null), 4000);
      } else {
        throw new Error("Reset endpoint returned error");
      }
    } catch {
      setErrorNotice("Failed to reset baseline. Ensure backend server is running.");
    } finally {
      setIsResettingBaseline(false);
    }
  };

  const handleFileSelection = (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setErrorNotice("Invalid file format. Only RFC-4180 compliant CSV files (.csv) are accepted.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorNotice("File size exceeds 10MB institutional limit. Please partition the payload.");
      return;
    }

    setErrorNotice(null);
    setSelectedFile(file);

    // Read and run client-side pre-check
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || "";
      const { headers, rows } = parseClientCSV(text);

      const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
      setTotalParsedRows(rows.length);

      const missing = MANDATORY_HEADERS.filter((mh) => !normalizedHeaders.includes(mh));
      setMissingHeaders(missing);

      if (missing.length > 0) {
        setErrorNotice(
          `Schema validation failed: Missing mandatory columns (${missing.join(", ")}). Re-check template v2026.1 specification.`
        );
      }

      // Generate first 5 preview rows
      const preview: PreCheckRow[] = rows.slice(0, 5).map((cols, idx) => {
        const rowDict: Record<string, string> = {};
        headers.forEach((h, colIdx) => {
          rowDict[h.toLowerCase()] = cols[colIdx] || "";
        });
        const hasYear = /^\d{4}-\d{4}$/.test(rowDict["academic_year"] || "");
        return {
          index: idx + 1,
          data: rowDict,
          isValid: hasYear && cols.length === headers.length,
        };
      });

      setPreCheckRows(preview);
    };

    reader.readAsText(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreCheckRows([]);
    setMissingHeaders([]);
    setTotalParsedRows(0);
    setErrorNotice(null);
    setIsProcessing(false);
    setProgressPercent(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile) return;

    if (missingHeaders.length > 0) {
      setErrorNotice("Cannot proceed: Correct missing mandatory column headers before submitting.");
      return;
    }

    setIsProcessing(true);
    setErrorNotice(null);

    // Simulation of progress steps while communicating with backend
    setProcessingPhase("Parsing and checksumming RFC-4180 stream...");
    setProgressPercent(25);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      setProcessingPhase("Executing APAAR boundaries & capacity checks (Row 1 to " + totalParsedRows + ")...");
      setProgressPercent(65);

      const res = await fetch("/api/batches/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let errorMsg = `Server error (${res.status} ${res.statusText || "Internal Server Error"})`;
        try {
          const errData = await res.json();
          errorMsg = errData.detail || errData.error || errorMsg;
        } catch {
          const text = await res.text();
          if (text) {
            errorMsg = text.length > 150 ? `${text.slice(0, 150)}...` : text;
          }
        }
        throw new Error(errorMsg);
      }

      setProcessingPhase("Finalizing audit logs and promoting valid enrolments...");
      setProgressPercent(90);

      const data = await res.json();

      setProgressPercent(100);

      // Redirect directly to Screen S-03 Batch Remediation Console
      setTimeout(() => {
        router.push(`/institution/batches/${data.batch_id}`);
      }, 500);
    } catch (err: unknown) {
      setIsProcessing(false);
      const msg = err instanceof Error ? err.message : "Network error uploading batch file.";
      setErrorNotice(msg);
    }
  };

  return (
    <div className="min-h-screen bg-transparent">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 workspace-main workspace-main">
        {/* Page Title & Breadcrumb */}
        <div className="mb-6">
          <div className="flex items-center space-x-2 text-xs font-mono uppercase text-slate-400 mb-1">
            <span>INSTITUTION PORTAL</span>
            <span>/</span>
            <span className="text-slate-200 font-semibold">SUBMISSION WORKSPACE</span>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Student Admission Batch Ingestion
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/template_v2026.csv"
                download="template_v2026.csv"
                className="inline-flex items-center text-xs font-medium text-violet-200 hover:text-white bg-violet-400/10 hover:bg-violet-300/15 border border-violet-200/20 px-3 py-1.5 rounded transition-colors"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Template (v2026.1)
              </a>
              <a
                href="/demo_data/synthetic_batch_overintake_135.csv"
                download="synthetic_batch_overintake_135.csv"
                className="inline-flex items-center text-xs font-medium text-slate-200 hover:text-slate-100 bg-white/[0.07] hover:bg-white/15 border border-violet-200/20 px-3 py-1.5 rounded transition-colors"
                title="PRD Step 1: 135 rows for 120 cap"
              >
                <Download className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                Demo 1: Overintake (135 rows)
              </a>
              <a
                href="/demo_data/synthetic_batch_concurrent_transfer.csv"
                download="synthetic_batch_concurrent_transfer.csv"
                className="inline-flex items-center text-xs font-medium text-amber-100 hover:text-amber-50 bg-amber-300/10 hover:bg-amber-300/15 border border-amber-200/25 px-3 py-1.5 rounded transition-colors"
                title="PRD Step 4: DUP-002 Cross-institutional clash"
              >
                <Download className="w-3.5 h-3.5 mr-1.5 text-amber-200" />
                Demo 2: Concurrent Conflict
              </a>
              <a
                href="/demo_data/synthetic_batch_mixed_statuses.csv"
                download="synthetic_batch_mixed_statuses.csv"
                className="inline-flex items-center text-xs font-medium text-emerald-100 hover:text-emerald-50 bg-emerald-400/10 hover:bg-emerald-400/15 border border-emerald-200/25 px-3 py-1.5 rounded transition-colors"
                title="Tri-status demo: 1 Accepted, 1 Warning (APR-001), 2 Rejections (APR-002, DUP-002)"
              >
                <Download className="w-3.5 h-3.5 mr-1.5 text-emerald-200" />
                Demo 3: Mixed (Pass + Warning + Reject)
              </a>
              <button
                type="button"
                onClick={handleResetBaseline}
                disabled={isResettingBaseline}
                className="inline-flex items-center text-xs font-medium text-slate-200 hover:text-slate-100 bg-white/[0.045] hover:bg-white/[0.035] border border-violet-200/20 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                title="Reset demo baseline: 0/120 intake capacity, Rahul Verma at Inst B"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-slate-400 ${isResettingBaseline ? "animate-spin" : ""}`} />
                {isResettingBaseline ? "Resetting..." : "Reset Demo Baseline"}
              </button>
            </div>
          </div>
        </div>

        {/* 3-Stage Progress Header */}
        <div className="glass-panel rounded p-4 mb-6 shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Stage 1 */}
            <div
              className={`flex items-center space-x-3 p-2 rounded ${
                !selectedFile
                  ? "bg-violet-400/10 border border-violet-200/20"
                  : "glass-control"
              }`}
            >
              <div
                className={`w-7 h-7 rounded flex items-center justify-center font-mono text-xs font-bold ${
                  selectedFile
                    ? "bg-emerald-500/80 text-white"
                    : "bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white"
                }`}
              >
                {selectedFile ? "âœ“" : "1"}
              </div>
              <div>
                <div className="text-xs font-semibold text-white">
                  Stage 1: Upload & Format Check
                </div>
                <div className="text-[11px] text-slate-400">
                  {selectedFile ? "Client pre-check passed" : "Select RFC-4180 CSV"}
                </div>
              </div>
            </div>

            {/* Stage 2 */}
            <div
              className={`flex items-center space-x-3 p-2 rounded ${
                isProcessing
                  ? "bg-violet-400/10 border border-violet-200/20"
                  : "glass-control"
              }`}
            >
              <div
                className={`w-7 h-7 rounded flex items-center justify-center font-mono text-xs font-bold ${
                  isProcessing
                    ? "bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white animate-pulse"
                    : "bg-white/10 text-slate-400"
                }`}
              >
                2
              </div>
              <div>
                <div className="text-xs font-semibold text-white">
                  Stage 2: Automated Validation
                </div>
                <div className="text-[11px] text-slate-400">
                  {isProcessing ? processingPhase : "Intake, APAAR & Duplicate rules"}
                </div>
              </div>
            </div>

            {/* Stage 3 */}
            <div className="flex items-center space-x-3 p-2 rounded glass-control">
              <div className="w-7 h-7 rounded flex items-center justify-center font-mono text-xs font-bold bg-white/10 text-slate-400">
                3
              </div>
              <div>
                <div className="text-xs font-semibold text-white">
                  Stage 3: Review & Remediation
                </div>
                <div className="text-[11px] text-slate-400">
                  Export annotated corrections
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Success / Status Callout */}
        {successNotice && (
          <div className="mb-6 p-4 bg-emerald-400/10 border border-emerald-300/25 rounded flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-200 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-emerald-200 uppercase tracking-wide">
                  Environment Ready
                </div>
                <div className="text-xs text-slate-200 mt-1">{successNotice}</div>
              </div>
            </div>
            <button
              onClick={() => setSuccessNotice(null)}
              className="text-xs text-slate-400 hover:text-slate-300 font-mono"
            >
              DISMISS
            </button>
          </div>
        )}

        {/* Error Callout */}
        {errorNotice && (
          <div className="mb-6 p-4 bg-rose-400/10 border border-rose-300/25 rounded flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <XCircle className="w-5 h-5 text-rose-200 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-rose-200 uppercase tracking-wide">
                  Validation Error Detected
                </div>
                <div className="text-xs text-slate-200 mt-1">{errorNotice}</div>
              </div>
            </div>
            <button
              onClick={() => setErrorNotice(null)}
              className="text-xs text-slate-400 hover:text-slate-300 font-mono"
            >
              DISMISS
            </button>
          </div>
        )}

        {/* File Ingestion Dropzone */}
        {!selectedFile ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded p-12 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-violet-300/50 bg-violet-400/10"
                : "border-violet-200/10 bg-white/[0.045] hover:border-slate-400 hover:bg-white/[0.02]"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleInputChange}
              accept=".csv"
              className="hidden"
            />
            <div className="w-12 h-12 mx-auto mb-4 bg-white/[0.07] rounded flex items-center justify-center text-slate-300">
              <UploadCloud className="w-6 h-6 text-violet-200" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">
              Select or drag and drop institutional enrolment CSV
            </h3>
            <p className="text-xs text-slate-400 mb-4 max-w-md mx-auto">
              Accepts RFC-4180 CSV, max 10MB (approx. 15,000 rows). Columns must match template v2026.1 specification.
            </p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center text-xs font-semibold text-white bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 specular-button hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 px-4 py-2 rounded"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Browse CSV File
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Selected File Summary Card */}
            <div className="glass-panel rounded p-4 flex items-center justify-between shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-violet-400/10 border border-violet-200/20 rounded">
                  <FileSpreadsheet className="w-6 h-6 text-violet-200" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-white">
                      {selectedFile.name}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 bg-white/[0.07] px-2 py-0.5 rounded">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 bg-white/[0.07] px-2 py-0.5 rounded">
                      {totalParsedRows} Data Rows
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Schema status:{" "}
                    {missingHeaders.length === 0 ? (
                      <span className="text-emerald-200 font-medium">
                        âœ“ All mandatory headers present
                      </span>
                    ) : (
                      <span className="text-rose-200 font-medium">
                        âš  Missing {missingHeaders.length} mandatory header(s)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isProcessing}
                  className="text-xs font-medium text-slate-300 hover:text-slate-200 border border-violet-200/10 hover:bg-white/[0.035] px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                >
                  Choose Different File
                </button>

                <button
                  type="button"
                  onClick={handleUploadSubmit}
                  disabled={isProcessing || missingHeaders.length > 0}
                  className="inline-flex items-center text-xs font-bold text-white bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 specular-button hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 px-4 py-2 rounded shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)] disabled:opacity-50 transition-colors"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Validating Batch...
                    </>
                  ) : (
                    <>
                      Execute AICTE Regulatory Validation
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Processing Progress Bar */}
            {isProcessing && (
              <div className="glass-panel rounded p-4 shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-white flex items-center">
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin text-violet-200" />
                    {processingPhase}
                  </span>
                  <span className="text-xs font-mono text-slate-300">
                    {progressPercent}%
                  </span>
                </div>
                <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 h-2 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Client-Side Schema Pre-Check Preview Table */}
            <div className="glass-panel rounded overflow-hidden shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
              <div className="px-4 py-3 border-b border-violet-200/10 bg-white/[0.035] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    Schema Pre-Check Table (First 5 Rows Preview)
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Pre-validated locally before initiating network ingestion to prevent redundant payloads.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  Showing 1-{preCheckRows.length} of {totalParsedRows} records
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-violet-200/10 text-xs">
                  <thead className="bg-white/[0.08]">
                    <tr>
                      <th className="px-3 py-2 text-left font-mono text-slate-300 uppercase text-[11px]">
                        Row #
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-300 uppercase text-[11px]">
                        APAAR ID
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-300 uppercase text-[11px]">
                        Student Name
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-300 uppercase text-[11px]">
                        Gender
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-300 uppercase text-[11px]">
                        Programme
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-300 uppercase text-[11px]">
                        Year
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-300 uppercase text-[11px]">
                        Category
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-300 uppercase text-[11px]">
                        Start Date
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-300 uppercase text-[11px]">
                        Pre-Check
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-violet-200/10 bg-white/[0.045]">
                    {preCheckRows.map((row) => (
                      <tr key={row.index} className="hover:bg-white/[0.04]">
                        <td className="px-3 py-2 font-mono text-slate-400">
                          #{row.index}
                        </td>
                        <td className="px-3 py-2 font-mono font-medium text-slate-200">
                          {row.data["apaar_id"] || (
                            <span className="text-slate-400 italic">voluntary null</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-100">
                          {row.data["full_name"]}
                        </td>
                        <td className="px-3 py-2 capitalize text-slate-200">
                          {row.data["gender"]}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-200">
                          {row.data["programme_code"]}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-200">
                          {row.data["academic_year"]}
                        </td>
                        <td className="px-3 py-2 uppercase font-mono text-[11px] text-slate-200">
                          {row.data["admission_category"]}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-200">
                          {row.data["start_date"]}
                        </td>
                        <td className="px-3 py-2">
                          {row.isValid ? (
                            <span className="inline-flex items-center text-[11px] font-mono font-semibold text-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              READY
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[11px] font-mono font-semibold text-rose-200">
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              FORMAT ISSUE
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-3 bg-white/[0.035] border-t border-violet-200/10 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center space-x-2">
                  <Info className="w-4 h-4 text-violet-300" />
                  <span>
                    Validation rules (CAP-001 intake quota, DUP-001/002 cross-tenant checks, Verhoeff checksum) will execute server-side on submission.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}






