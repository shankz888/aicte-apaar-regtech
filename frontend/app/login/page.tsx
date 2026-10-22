"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Building2,
  Lock,
  Mail,
  UserCheck,
  AlertCircle,
  Clock,
  ArrowRight,
  FileCheck,
  ShieldAlert,
} from "lucide-react";

type RoleOption = "aicte_admin" | "institution" | "verifier";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleOption>("institution");
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(300);
  const [isLoading, setIsLoading] = useState(false);

  // Quick 1-Click Persona selection for evaluators
  const selectPersona = (pRole: RoleOption, pEmail: string) => {
    setRole(pRole);
    setEmail(pEmail);
    setPassword("regulatoryDemoPass2026!");
    setError(null);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (rateLimited) return;

    if (!email || !password) {
      setError("Please provide both email address and access key.");
      return;
    }

    setIsLoading(true);

    // Simulate authentication verification
    setTimeout(() => {
      setIsLoading(false);

      if (role === "aicte_admin") {
        router.push("/admin/overview");
      } else if (role === "institution") {
        router.push("/institution/submit");
      } else {
        router.push("/verify/chk_demo8723");
      }
    }, 450);
  };

  const triggerRateLimitSimulation = () => {
    setRateLimited(true);
    setError("Too many failed attempts. Locked for 300s.");
    const interval = setInterval(() => {
      setLockoutTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setRateLimited(false);
          setError(null);
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between">
      {/* Top Header Bar */}
      <header className="bg-[#0F172A] border-b border-slate-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-[#1D4ED8] p-2 rounded">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base tracking-tight text-white">
                  ALL INDIA COUNCIL FOR TECHNICAL EDUCATION
                </span>
                <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
                  SIH-2026
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ministry of Education, Government of India | APAAR Data Governance Portal
              </p>
            </div>
          </div>
          <div className="text-right hidden md:block">
            <div className="text-xs font-mono text-slate-300">Statutory Helpline: 1800-11-2026</div>
            <div className="text-[11px] text-slate-400">compliance-desk@aicte-india.org</div>
          </div>
        </div>
      </header>

      {/* Main Split Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col lg:flex-row items-stretch gap-10">
        {/* Left Column: Governance Metadata & Mandates */}
        <div className="lg:w-7/12 flex flex-col justify-between space-y-6">
          <div>
            <div className="inline-flex items-center px-2.5 py-1 rounded bg-blue-50 border border-blue-200 text-[#1D4ED8] text-xs font-semibold mb-4">
              <FileCheck className="w-3.5 h-3.5 mr-1.5" />
              Statutory RegTech Authentication Gateway (Screen S-01)
            </div>

            <h1 className="text-3xl font-extrabold text-[#0F172A] tracking-tight leading-tight">
              National Student Enrolment Governance & Cryptographic Verification Platform
            </h1>

            <p className="mt-3 text-slate-600 text-sm leading-relaxed">
              Mandatory regulatory interface for AICTE-approved institutions and authorized external
              verifiers. Automated validation guarantees approved intake ceiling enforcement,
              cross-institutional active duplicate prevention, and zero-knowledge privacy assertions.
            </p>
          </div>

          {/* Statutory Boundaries Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
              <ShieldAlert className="w-4 h-4 mr-1.5 text-amber-600" />
              Core Boundary Directives & Compliance Architecture
            </h3>
            <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
              <li className="flex items-start">
                <span className="text-[#15803D] font-bold mr-2">✓</span>
                <span>
                  <strong>Data Minimization:</strong> Indian national Aadhaar numbers are never collected or stored. APAAR ID validation is isolated via secure checksum adapter.
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-[#15803D] font-bold mr-2">✓</span>
                <span>
                  <strong>Deterministic Intake Enforcement:</strong> Real-time rejection of admissions exceeding sanctioned program intake capacity (Rule CAP-001).
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-[#15803D] font-bold mr-2">✓</span>
                <span>
                  <strong>Zero-Knowledge Third-Party Verifications:</strong> Ephemeral 72-hour HMAC-SHA256 tokens redact all PII, dates of birth, and APAAR strings from external verifiers.
                </span>
              </li>
            </ul>
          </div>

          {/* 1-Click Quick Evaluator Personas */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-2">
              Evaluator Quick-Launch Personas (1-Click Test Access)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => selectPersona("institution", "principal@apextech.edu.in")}
                className="text-left p-2.5 bg-white border border-slate-200 hover:border-blue-400 rounded transition text-xs group"
              >
                <div className="font-semibold text-slate-900 group-hover:text-blue-700 flex items-center">
                  <Building2 className="w-3.5 h-3.5 mr-1 text-blue-600" />
                  Institution Admin
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">Apex Institute of Tech</div>
              </button>

              <button
                type="button"
                onClick={() => selectPersona("aicte_admin", "admin@aicte.gov.in")}
                className="text-left p-2.5 bg-white border border-slate-200 hover:border-emerald-400 rounded transition text-xs group"
              >
                <div className="font-semibold text-slate-900 group-hover:text-emerald-700 flex items-center">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                  Central Regulator
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">AICTE Central Admin</div>
              </button>

              <button
                type="button"
                onClick={() => selectPersona("verifier", "verifier@deloitte-audit.com")}
                className="text-left p-2.5 bg-white border border-slate-200 hover:border-purple-400 rounded transition text-xs group"
              >
                <div className="font-semibold text-slate-900 group-hover:text-purple-700 flex items-center">
                  <UserCheck className="w-3.5 h-3.5 mr-1 text-purple-600" />
                  External Verifier
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">chk_demo8723 Token</div>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: High Contrast Authentication Card */}
        <div className="lg:w-5/12 flex items-center">
          <div className="w-full bg-white border border-[#E2E8F0] rounded-xl shadow-md p-7 sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-[#0F172A]">Official Portal Sign-In</h2>
              <p className="text-xs text-slate-500 mt-1">
                Enter your institutional or regulatory credentials to access the workspace.
              </p>
            </div>

            {/* Error Notification */}
            {error && (
              <div className="mb-5 bg-[#FEF2F2] border border-[#FECACA] rounded p-3 text-xs text-[#B91C1C] flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{error}</span>
                  {rateLimited && (
                    <div className="font-mono mt-1 text-[11px] font-semibold">
                      Lockout countdown: {lockoutTimer}s remaining
                    </div>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Role Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Designated Authorization Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as RoleOption)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:bg-white transition"
                  disabled={rateLimited}
                >
                  <option value="institution">Institution Admin / Operator (Apex Institute #SYN-MH-0001)</option>
                  <option value="aicte_admin">AICTE Central Regulatory Administrator</option>
                  <option value="verifier">External Verification Screener (Token Gateway)</option>
                </select>
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address / Institutional ID
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. principal@apextech.edu.in"
                    className="w-full text-xs pl-9 pr-3 py-2.5 border border-slate-300 rounded text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] transition"
                    disabled={rateLimited}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Password / Passkey
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full text-xs pl-9 pr-3 py-2.5 border border-slate-300 rounded text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] transition"
                    disabled={rateLimited}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || rateLimited}
                className="w-full mt-2 inline-flex items-center justify-center bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:bg-slate-400 text-white font-medium text-xs py-2.5 px-4 rounded transition shadow-sm"
              >
                {isLoading ? (
                  <>
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                    Validating Credentials...
                  </>
                ) : (
                  <>
                    Authenticate & Access Workspace
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </button>
            </form>

            {/* Test Rate Limit simulation toggle */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>Security Level: Argon2id Encrypted</span>
              <button
                type="button"
                onClick={triggerRateLimitSimulation}
                className="text-slate-500 hover:text-slate-800 underline"
              >
                Simulate Lockout
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            © 2026 All India Council for Technical Education (AICTE). All statutory rights reserved.
          </div>
          <div className="flex space-x-4">
            <span className="hover:underline cursor-pointer">Security Protocol</span>
            <span className="hover:underline cursor-pointer">Terms of Compliance</span>
            <span className="hover:underline cursor-pointer">Technical Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
