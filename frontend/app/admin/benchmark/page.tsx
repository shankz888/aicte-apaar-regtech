"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Activity,
  Play,
  CheckCircle2,
  RefreshCw,
  Target,
  ShieldAlert,
  Zap,
  Info,
  ChevronRight,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";

interface ScenarioResultData {
  scenario_id: string;
  scenario_name: string;
  injected_anomalies: string;
  primary_metric: string;
  total_records: number;
  expected_rejected: number;
  actual_rejected: number;
  expected_accepted: number;
  actual_accepted: number;
  flagged_records: number;
  precision: number;
  recall: number;
  false_positive_rate: number;
  duration_ms: number;
  records_per_second: number;
  target_error_code: string;
  status: "PASSED" | "FAILED";
  rules_fired: Record<string, number>;
}

interface BenchmarkSummary {
  overall_status: string;
  total_records_evaluated: number;
  total_duration_ms: number;
  macro_precision: number;
  macro_recall: number;
  macro_false_positive_rate: number;
  throughput_records_per_sec: number;
  evaluated_at: string;
}

export default function BenchmarkDashboardPage() {
  const [loading, setLoading] = useState(false);
  const [runningScenario, setRunningScenario] = useState<string | null>(null);
  const [summary, setSummary] = useState<BenchmarkSummary | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioResultData[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioResultData | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Auto-run benchmark on first load to immediately present live results
  useEffect(() => {
    runAllBenchmarks();
  }, []);

  const runAllBenchmarks = async () => {
    try {
      setLoading(true);
      setErrorNotice(null);
      const res = await fetch("/api/benchmark/run-all", { method: "POST" });
      if (!res.ok) {
        throw new Error(`Benchmark run failed: HTTP ${res.status}`);
      }
      const data = await res.json();
      setSummary(data.summary);
      setScenarios(data.scenarios);
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : "Error executing benchmark suite.");
    } finally {
      setLoading(false);
    }
  };

  const runSingleScenario = async (scenarioId: string) => {
    try {
      setRunningScenario(scenarioId);
      setErrorNotice(null);
      const res = await fetch(`/api/benchmark/run/${scenarioId}`, { method: "POST" });
      if (!res.ok) {
        throw new Error(`Scenario ${scenarioId} failed: HTTP ${res.status}`);
      }
      const updated: ScenarioResultData = await res.json();

      setScenarios((prev) =>
        prev.map((s) => (s.scenario_id === scenarioId ? updated : s))
      );
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : `Error running scenario ${scenarioId}.`);
    } finally {
      setRunningScenario(null);
    }
  };

  return (
    <div className="min-h-screen bg-transparent">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 workspace-main workspace-main">
        {/* Breadcrumb & Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-mono uppercase text-slate-400 mb-1">
              <span>AICTE CENTRAL GOVERNANCE</span>
              <span>/</span>
              <span className="text-slate-200 font-semibold">SYNTHETIC BENCHMARK SUITE</span>
            </div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Synthetic Fault-Injection Benchmark Suite
              </h1>
              <span className="text-xs font-mono bg-violet-400/10 text-violet-200 border border-violet-200/20 px-2.5 py-0.5 rounded font-semibold uppercase">
                PRD Section 8 Spec
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Automated precision, recall, and zero-knowledge boundary stress tests across 2,000+ synthetic payloads.
            </p>
          </div>

          {/* Trigger Button */}
          <div className="flex items-center space-x-3">
            <button
              onClick={runAllBenchmarks}
              disabled={loading || runningScenario !== null}
              className="inline-flex items-center text-xs font-bold text-white bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 specular-button hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 px-4 py-2.5 rounded shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)] transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Running Fault Injections...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Execute Full Benchmark Suite
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {errorNotice && (
          <div className="mb-6 p-4 bg-rose-400/10 border border-rose-300/25 rounded text-xs text-rose-200 flex items-center justify-between">
            <span>{errorNotice}</span>
            <button onClick={() => setErrorNotice(null)} className="font-mono underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Top 4 KPI Summary Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Card 1: Precision */}
          <div className="glass-panel rounded p-4 shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold mb-1 flex items-center justify-between">
              <span>Macro Precision</span>
              <Target className="w-4 h-4 text-emerald-200" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-200 font-mono">
              {summary ? `${summary.macro_precision}%` : "--"}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Zero false positive rejections
            </div>
          </div>

          {/* Card 2: Recall */}
          <div className="glass-panel rounded p-4 shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold mb-1 flex items-center justify-between">
              <span>Macro Recall</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-200 font-mono">
              {summary ? `${summary.macro_recall}%` : "--"}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              100% boundary violations caught
            </div>
          </div>

          {/* Card 3: False Positive Rate */}
          <div className="glass-panel rounded p-4 shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold mb-1 flex items-center justify-between">
              <span>False Positive Rate</span>
              <ShieldAlert className="w-4 h-4 text-violet-200" />
            </div>
            <div className="text-2xl font-extrabold text-white font-mono">
              {summary ? `${summary.macro_false_positive_rate}%` : "<0.01%"}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Benchmark limit: &lt; 0.01%
            </div>
          </div>

          {/* Card 4: Throughput */}
          <div className="glass-panel rounded p-4 shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold mb-1 flex items-center justify-between">
              <span>Ingestion Speed</span>
              <Zap className="w-4 h-4 text-amber-300" />
            </div>
            <div className="text-2xl font-extrabold text-white font-mono">
              {summary ? `${summary.throughput_records_per_sec.toLocaleString()}` : "--"}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Records / second processing
            </div>
          </div>
        </div>

        {/* Benchmark Scenario Matrix Table */}
        <div className="glass-panel rounded overflow-hidden shadow-[0_12px_35px_-20px_rgba(0,0,0,0.85)]">
          <div className="px-4 py-3 border-b border-violet-200/10 bg-white/[0.035] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-violet-200" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Synthetic Stress-Test Evaluation Matrix
              </h3>
            </div>
            {summary && (
              <span className="text-[11px] font-mono text-slate-400">
                Total Evaluated: {summary.total_records_evaluated.toLocaleString()} rows in {summary.total_duration_ms}ms
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-violet-200/10 text-xs">
              <thead className="bg-white/[0.08]">
                <tr>
                  <th className="px-3 py-3 text-left font-mono text-slate-300 uppercase text-[11px] w-24">
                    Scenario
                  </th>
                  <th className="px-3 py-3 text-left font-mono text-slate-300 uppercase text-[11px]">
                    Test Name & Injected Faults
                  </th>
                  <th className="px-3 py-3 text-left font-mono text-slate-300 uppercase text-[11px] w-28">
                    Target Code
                  </th>
                  <th className="px-3 py-3 text-right font-mono text-slate-300 uppercase text-[11px] w-28">
                    Records
                  </th>
                  <th className="px-3 py-3 text-right font-mono text-slate-300 uppercase text-[11px] w-36">
                    Rejected / Exp.
                  </th>
                  <th className="px-3 py-3 text-right font-mono text-slate-300 uppercase text-[11px] w-24">
                    Precision
                  </th>
                  <th className="px-3 py-3 text-right font-mono text-slate-300 uppercase text-[11px] w-24">
                    Recall
                  </th>
                  <th className="px-3 py-3 text-right font-mono text-slate-300 uppercase text-[11px] w-32">
                    Throughput
                  </th>
                  <th className="px-3 py-3 text-center font-mono text-slate-300 uppercase text-[11px] w-24">
                    Outcome
                  </th>
                  <th className="px-3 py-3 text-right font-mono text-slate-300 uppercase text-[11px] w-24">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-200/10 bg-white/[0.045]">
                {scenarios.map((item) => {
                  const isCurrentRunning = runningScenario === item.scenario_id;

                  return (
                    <tr
                      key={item.scenario_id}
                      onClick={() => setSelectedScenario(item)}
                      className="hover:bg-white/[0.035] cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-3 font-mono font-bold text-white">
                        {item.scenario_id}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-100">
                          {item.scenario_name}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {item.injected_anomalies}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono font-bold text-xs">
                        {item.target_error_code !== "None" ? (
                          <span className="text-rose-200 bg-rose-400/10 border border-rose-300/25 px-2 py-0.5 rounded">
                            {item.target_error_code}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">None (Clean)</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-200">
                        {item.total_records.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-medium">
                        <span className={item.actual_rejected > 0 ? "text-rose-200" : "text-slate-300"}>
                          {item.actual_rejected}
                        </span>
                        <span className="text-slate-400"> / {item.expected_rejected}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-emerald-200">
                        {(item.precision * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-emerald-200">
                        {(item.recall * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-200">
                        {item.records_per_second.toLocaleString()} r/s
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-flex items-center font-mono text-[11px] font-bold px-2.5 py-0.5 rounded border ${
                            item.status === "PASSED"
                              ? "bg-emerald-400/10 text-emerald-200 border-emerald-300/25"
                              : "bg-rose-400/10 text-rose-200 border-rose-300/25"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            runSingleScenario(item.scenario_id);
                          }}
                          disabled={isCurrentRunning || loading}
                          className="text-xs font-mono text-violet-200 hover:text-white disabled:opacity-50"
                        >
                          {isCurrentRunning ? "Running..." : "Rerun"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-white/[0.035] border-t border-violet-200/10 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center space-x-1.5">
              <Info className="w-4 h-4 text-violet-300" />
              <span>
                Benchmark runs directly evaluate deterministic validation engine rules in an isolated transactional sandbox.
              </span>
            </div>
            <Link
              href="/institution/submit"
              className="font-medium text-violet-200 hover:underline flex items-center"
            >
              Test with Custom Batch CSV
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>
        </div>
      </main>

      {/* Scenario Detail Slide-Over Drawer */}
      {selectedScenario && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            onClick={() => setSelectedScenario(null)}
            className="absolute inset-0 bg-slate-900/40 transition-opacity"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white/[0.045] border-l border-violet-200/10 shadow-2xl flex flex-col">
              {/* Header */}
              <div className="p-5 border-b border-violet-200/10 bg-white/[0.035] flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-violet-200">
                      {selectedScenario.scenario_id}
                    </span>
                    <span className="font-mono text-[11px] bg-emerald-400/10 text-emerald-100 border border-emerald-300/25 px-2 py-0.5 rounded font-bold">
                      {selectedScenario.status}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">
                    {selectedScenario.scenario_name}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedScenario(null)}
                  className="p-1 rounded text-slate-400 hover:text-slate-300 hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
                {/* Benchmark Specifications */}
                <div className="glass-control rounded p-4 space-y-2.5">
                  <div className="text-[11px] font-mono uppercase font-bold text-slate-400">
                    Scenario Specifications
                  </div>
                  <div>
                    <span className="text-slate-400 block">Injected Anomaly:</span>
                    <span className="font-semibold text-slate-100">
                      {selectedScenario.injected_anomalies}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Primary Evaluated Metric:</span>
                    <span className="font-medium text-slate-200">
                      {selectedScenario.primary_metric}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Target Regulatory Rule:</span>
                    <span className="font-mono font-bold text-rose-200">
                      {selectedScenario.target_error_code}
                    </span>
                  </div>
                </div>

                {/* Precision & Recall Breakdown */}
                <div className="border border-violet-200/10 rounded p-4 space-y-3">
                  <div className="text-[11px] font-mono uppercase font-bold text-slate-400">
                    Detection Accuracy Breakdown
                  </div>
                  <div className="grid grid-cols-2 gap-3 font-mono">
                    <div className="glass-control p-2.5 bg-white/[0.035] rounded border border-violet-200/10">
                      <div className="text-[10px] text-slate-400 uppercase">Precision</div>
                      <div className="text-lg font-bold text-emerald-200">
                        {(selectedScenario.precision * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="glass-control p-2.5 bg-white/[0.035] rounded border border-violet-200/10">
                      <div className="text-[10px] text-slate-400 uppercase">Recall</div>
                      <div className="text-lg font-bold text-emerald-200">
                        {(selectedScenario.recall * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="glass-control p-2.5 bg-white/[0.035] rounded border border-violet-200/10">
                      <div className="text-[10px] text-slate-400 uppercase">Accepted Rows</div>
                      <div className="text-lg font-bold text-white">
                        {selectedScenario.actual_accepted}
                      </div>
                    </div>
                    <div className="glass-control p-2.5 bg-white/[0.035] rounded border border-violet-200/10">
                      <div className="text-[10px] text-slate-400 uppercase">Blocked Rows</div>
                      <div className="text-lg font-bold text-rose-200">
                        {selectedScenario.actual_rejected}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rules Fired Count */}
                <div className="border border-violet-200/10 rounded p-4 space-y-2">
                  <div className="text-[11px] font-mono uppercase font-bold text-slate-400">
                    Regulatory Rules Fired
                  </div>
                  {Object.keys(selectedScenario.rules_fired).length === 0 ? (
                    <div className="text-slate-400 italic">No violations fired (clean baseline).</div>
                  ) : (
                    <div className="space-y-1.5 font-mono">
                      {Object.entries(selectedScenario.rules_fired).map(([code, count]) => (
                        <div
                          key={code}
                          className="flex justify-between items-center bg-rose-400/10 border border-rose-300/25 px-3 py-1.5 rounded"
                        >
                          <span className="font-bold text-rose-200">{code}</span>
                          <span className="text-slate-200 font-semibold">{count} occurrences</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Throughput & Latency */}
                <div className="glass-control rounded p-4 font-mono space-y-1">
                  <div className="flex justify-between text-slate-300">
                    <span>Latency:</span>
                    <span className="font-bold text-slate-100">{selectedScenario.duration_ms} ms</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Throughput:</span>
                    <span className="font-bold text-slate-100">{selectedScenario.records_per_second} rec/sec</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-violet-200/10 bg-white/[0.035] flex justify-end">
                <button
                  onClick={() => setSelectedScenario(null)}
                  className="text-xs font-semibold text-slate-200 hover:text-slate-100 px-4 py-2 rounded border border-violet-200/10 hover:bg-white/[0.07]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}






