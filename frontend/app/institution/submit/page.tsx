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

      setProcessingPhase("Finalizing audit logs and promoting valid enrolments...");
      setProgressPercent(90);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || "Batch ingestion failed on server.");
      }

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
    <div className="min-h-screen bg-[#F8FAFC]">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title & Breadcrumb */}
        <div className="mb-6">
          <div className="flex items-center space-x-2 text-xs font-mono uppercase text-slate-500 mb-1">
            <span>INSTITUTION PORTAL</span>
            <span>/</span>
            <span className="text-slate-800 font-semibold">SUBMISSION WORKSPACE</span>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
              Student Admission Batch Ingestion
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/template_v2026.csv"
                download="template_v2026.csv"
                className="inline-flex items-center text-xs font-medium text-[#1D4ED8] hover:text-[#1E40AF] bg-blue-50/80 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded transition-colors"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Template (v2026.1)
              </a>
              <a
                href="/demo_data/synthetic_batch_overintake_135.csv"
                download="synthetic_batch_overintake_135.csv"
                className="inline-flex items-center text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-3 py-1.5 rounded transition-colors"
                title="PRD Step 1: 135 rows for 120 cap"
              >
                <Download className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                Demo 1: Overintake (135 rows)
              </a>
              <a
                href="/demo_data/synthetic_batch_concurrent_transfer.csv"
                download="synthetic_batch_concurrent_transfer.csv"
                className="inline-flex items-center text-xs font-medium text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-3 py-1.5 rounded transition-colors"
                title="PRD Step 4: DUP-002 Cross-institutional clash"
              >
                <Download className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                Demo 2: Concurrent Conflict
              </a>
              <a
                href="/demo_data/synthetic_batch_mixed_statuses.csv"
                download="synthetic_batch_mixed_statuses.csv"
                className="inline-flex items-center text-xs font-medium text-emerald-800 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded transition-colors"
                title="Tri-status demo: 1 Accepted, 1 Warning (APR-001), 2 Rejections (APR-002, DUP-002)"
              >
                <Download className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                Demo 3: Mixed (Pass + Warning + Reject)
              </a>
            </div>
          </div>
        </div>

        {/* 3-Stage Progress Header */}
        <div className="bg-white border border-[#E2E8F0] rounded p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Stage 1 */}
            <div
              className={`flex items-center space-x-3 p-2 rounded ${
                !selectedFile
                  ? "bg-blue-50/70 border border-blue-200"
                  : "bg-slate-50 border border-slate-200"
              }`}
            >
              <div
                className={`w-7 h-7 rounded flex items-center justify-center font-mono text-xs font-bold ${
                  selectedFile
                    ? "bg-[#15803D] text-white"
                    : "bg-[#1D4ED8] text-white"
                }`}
              >
                {selectedFile ? "✓" : "1"}
              </div>
              <div>
                <div className="text-xs font-semibold text-[#0F172A]">
                  Stage 1: Upload & Format Check
                </div>
                <div className="text-[11px] text-slate-500">
                  {selectedFile ? "Client pre-check passed" : "Select RFC-4180 CSV"}
                </div>
              </div>
            </div>

            {/* Stage 2 */}
            <div
              className={`flex items-center space-x-3 p-2 rounded ${
                isProcessing
                  ? "bg-blue-50/70 border border-blue-200"
                  : "bg-slate-50/60 border border-slate-200"
              }`}
            >
              <div
                className={`w-7 h-7 rounded flex items-center justify-center font-mono text-xs font-bold ${
                  isProcessing
                    ? "bg-[#1D4ED8] text-white animate-pulse"
                    : "bg-slate-300 text-slate-700"
                }`}
              >
                2
              </div>
              <div>
                <div className="text-xs font-semibold text-[#0F172A]">
                  Stage 2: Automated Validation
                </div>
                <div className="text-[11px] text-slate-500">
                  {isProcessing ? processingPhase : "Intake, APAAR & Duplicate rules"}
                </div>
              </div>
            </div>

            {/* Stage 3 */}
            <div className="flex items-center space-x-3 p-2 rounded bg-slate-50/60 border border-slate-200">
              <div className="w-7 h-7 rounded flex items-center justify-center font-mono text-xs font-bold bg-slate-300 text-slate-700">
                3
              </div>
              <div>
                <div className="text-xs font-semibold text-[#0F172A]">
                  Stage 3: Review & Remediation
                </div>
                <div className="text-[11px] text-slate-500">
                  Export annotated corrections
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error Callout */}
        {errorNotice && (
          <div className="mb-6 p-4 bg-[#FEF2F2] border border-[#FECACA] rounded flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <XCircle className="w-5 h-5 text-[#B91C1C] flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-[#B91C1C] uppercase tracking-wide">
                  Validation Error Detected
                </div>
                <div className="text-xs text-slate-700 mt-1">{errorNotice}</div>
              </div>
            </div>
            <button
              onClick={() => setErrorNotice(null)}
              className="text-xs text-slate-400 hover:text-slate-600 font-mono"
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
                ? "border-[#1D4ED8] bg-blue-50/40"
                : "border-[#E2E8F0] bg-white hover:border-slate-400 hover:bg-slate-50/50"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleInputChange}
              accept=".csv"
              className="hidden"
            />
            <div className="w-12 h-12 mx-auto mb-4 bg-slate-100 rounded flex items-center justify-center text-slate-600">
              <UploadCloud className="w-6 h-6 text-[#1D4ED8]" />
            </div>
            <h3 className="text-sm font-semibold text-[#0F172A] mb-1">
              Select or drag and drop institutional enrolment CSV
            </h3>
            <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
              Accepts RFC-4180 CSV, max 10MB (approx. 15,000 rows). Columns must match template v2026.1 specification.
            </p>
            <div className="inline-flex items-center text-xs font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] px-4 py-2 rounded shadow-sm">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Browse CSV File
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Selected File Summary Card */}
            <div className="bg-white border border-[#E2E8F0] rounded p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded">
                  <FileSpreadsheet className="w-6 h-6 text-[#1D4ED8]" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-[#0F172A]">
                      {selectedFile.name}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {totalParsedRows} Data Rows
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Schema status:{" "}
                    {missingHeaders.length === 0 ? (
                      <span className="text-[#15803D] font-medium">
                        ✓ All mandatory headers present
                      </span>
                    ) : (
                      <span className="text-[#B91C1C] font-medium">
                        ⚠ Missing {missingHeaders.length} mandatory header(s)
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
                  className="text-xs font-medium text-slate-600 hover:text-slate-800 border border-[#E2E8F0] hover:bg-slate-50 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                >
                  Choose Different File
                </button>

                <button
                  type="button"
                  onClick={handleUploadSubmit}
                  disabled={isProcessing || missingHeaders.length > 0}
                  className="inline-flex items-center text-xs font-bold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] px-4 py-2 rounded shadow-sm disabled:opacity-50 transition-colors"
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
              <div className="bg-white border border-[#E2E8F0] rounded p-4 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-[#0F172A] flex items-center">
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin text-[#1D4ED8]" />
                    {processingPhase}
                  </span>
                  <span className="text-xs font-mono text-slate-600">
                    {progressPercent}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-[#1D4ED8] h-2 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Client-Side Schema Pre-Check Preview Table */}
            <div className="bg-white border border-[#E2E8F0] rounded overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-[#E2E8F0] bg-slate-50 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                    Schema Pre-Check Table (First 5 Rows Preview)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Pre-validated locally before initiating network ingestion to prevent redundant payloads.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500">
                  Showing 1–{preCheckRows.length} of {totalParsedRows} records
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[#E2E8F0] text-xs">
                  <thead className="bg-slate-100/75">
                    <tr>
                      <th className="px-3 py-2 text-left font-mono text-slate-600 uppercase text-[11px]">
                        Row #
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-600 uppercase text-[11px]">
                        APAAR ID
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-600 uppercase text-[11px]">
                        Student Name
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-600 uppercase text-[11px]">
                        Gender
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-600 uppercase text-[11px]">
                        Programme
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-600 uppercase text-[11px]">
                        Year
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-600 uppercase text-[11px]">
                        Category
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-600 uppercase text-[11px]">
                        Start Date
                      </th>
                      <th className="px-3 py-2 text-left font-mono text-slate-600 uppercase text-[11px]">
                        Pre-Check
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] bg-white">
                    {preCheckRows.map((row) => (
                      <tr key={row.index} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 font-mono text-slate-500">
                          #{row.index}
                        </td>
                        <td className="px-3 py-2 font-mono font-medium text-slate-800">
                          {row.data["apaar_id"] || (
                            <span className="text-slate-400 italic">voluntary null</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {row.data["full_name"]}
                        </td>
                        <td className="px-3 py-2 capitalize text-slate-700">
                          {row.data["gender"]}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700">
                          {row.data["programme_code"]}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700">
                          {row.data["academic_year"]}
                        </td>
                        <td className="px-3 py-2 uppercase font-mono text-[11px] text-slate-700">
                          {row.data["admission_category"]}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700">
                          {row.data["start_date"]}
                        </td>
                        <td className="px-3 py-2">
                          {row.isValid ? (
                            <span className="inline-flex items-center text-[11px] font-mono font-semibold text-[#15803D]">
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              READY
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[11px] font-mono font-semibold text-[#B91C1C]">
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

              <div className="p-3 bg-slate-50 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center space-x-2">
                  <Info className="w-4 h-4 text-blue-600" />
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
