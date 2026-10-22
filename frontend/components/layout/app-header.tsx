"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ShieldCheck,
  UploadCloud,
  BarChart3,
  CheckCircle,
  Cpu,
  LogOut,
} from "lucide-react";

export const AppHeader: React.FC = () => {
  const pathname = usePathname();

  // Determine current active section for highlight
  const isSubmit = pathname?.startsWith("/institution");
  const isAdminOverview = pathname === "/admin/overview";
  const isBenchmark = pathname === "/admin/benchmark";
  const isVerifier = pathname?.startsWith("/verify");

  return (
    <header className="bg-[#0F172A] border-b border-slate-800 text-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & System Title */}
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="bg-[#1D4ED8] p-2 rounded group-hover:bg-[#1E40AF] transition-colors">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-base tracking-tight text-white">
                    AICTE REGTECH
                  </span>
                  <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
                    v2026.1
                  </span>
                </div>
                <p className="text-xs text-slate-400 hidden sm:block">
                  APAAR ID Academic Governance Platform
                </p>
              </div>
            </Link>
          </div>

          {/* Navigation Items */}
          <nav className="hidden lg:flex items-center space-x-1">
            <Link
              href="/institution/submit"
              className={`inline-flex items-center text-xs font-medium px-3 py-1.5 rounded transition-colors ${
                isSubmit
                  ? "bg-slate-800 text-white border border-slate-700 font-semibold"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
              Institutional Ingestion
            </Link>

            <Link
              href="/admin/overview"
              className={`inline-flex items-center text-xs font-medium px-3 py-1.5 rounded transition-colors ${
                isAdminOverview
                  ? "bg-slate-800 text-white border border-slate-700 font-semibold"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              Central Compliance
            </Link>

            <Link
              href="/admin/benchmark"
              className={`inline-flex items-center text-xs font-medium px-3 py-1.5 rounded transition-colors ${
                isBenchmark
                  ? "bg-slate-800 text-white border border-slate-700 font-semibold"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Cpu className="w-3.5 h-3.5 mr-1.5 text-purple-400" />
              Benchmark Engine
            </Link>

            <Link
              href="/verify/chk_demo8723"
              className={`inline-flex items-center text-xs font-medium px-3 py-1.5 rounded transition-colors ${
                isVerifier
                  ? "bg-slate-800 text-white border border-slate-700 font-semibold"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              Verifier Portal
            </Link>
          </nav>

          {/* Persona / Switcher */}
          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-2 pl-3 border-l border-slate-800 text-right">
              <Building2 className="w-4 h-4 text-slate-400" />
              <div className="text-left">
                <div className="text-xs font-semibold text-slate-200">
                  {isAdminOverview ? "AICTE Central Admin" : "Apex Institute of Tech"}
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {isAdminOverview ? "National Regulatory Directorate" : "ID: #SYN-MH-0001"}
                </div>
              </div>
            </div>

            <Link
              href="/login"
              title="Switch Persona / Login"
              className="inline-flex items-center text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-2.5 py-1.5 rounded border border-slate-700 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 mr-1 text-slate-400" />
              <span className="hidden sm:inline">Switch Role</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
};
