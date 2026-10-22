"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  Building2,
  GraduationCap,
  Calendar,
  Lock,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";

interface VerificationAssertion {
  student_full_name: string;
  institution_name: string;
  programme_name: string;
  academic_year: string;
  enrolment_status: string;
}

interface CryptographicProof {
  verification_hash: string;
  token_hash: string;
  issued_at: string;
  expires_at: string;
  ttl_remaining_seconds: number;
  requester_org: string;
  purpose: string;
}

interface VerificationResponse {
  valid: boolean;
  status: string;
  reason: string | null;
  assertion: VerificationAssertion | null;
  cryptographic_proof: CryptographicProof | null;
}

export default function VerifierGatewayPage({
  params,
}: {
  params: { token: string };
}) {
  const routeParams = useParams();
  const token = params?.token || (routeParams?.token as string) || "";

  const [data, setData] = useState<VerificationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedHash, setCopiedHash] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    async function fetchVerification() {
      try {
        setLoading(true);
        const res = await fetch(`/api/verify/${encodeURIComponent(token)}`);
        const result: VerificationResponse = await res.json();
        setData(result);
        if (result.cryptographic_proof?.ttl_remaining_seconds) {
          setSecondsLeft(result.cryptographic_proof.ttl_remaining_seconds);
        }
      } catch {
        setData({
          valid: false,
          status: "UNABLE_TO_VERIFY",
          reason: "Network error communicating with AICTE verification gateway.",
          assertion: null,
          cryptographic_proof: null,
        });
      } finally {
        setLoading(false);
      }
    }
    fetchVerification();
  }, [token]);

  // Live countdown timer for ephemeral token
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsLeft]);

  const formatCountdown = (totalSecs: number) => {
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      {/* Isolated Purpose-Bound Gateway Container */}
      <div className="w-full max-w-xl">
        {/* Gateway Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-2.5 bg-[#0F172A] rounded-lg shadow-sm mb-3">
            <ShieldCheck className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#0F172A]">
            AICTE Academic Verification Gateway
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Zero-Knowledge Purpose-Bound Credential Assertion
          </p>
        </div>

        {loading ? (
          <div className="bg-white border border-[#E2E8F0] rounded p-12 text-center shadow-sm">
            <RefreshCw className="w-8 h-8 animate-spin text-[#1D4ED8] mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[#0F172A]">
              Verifying Cryptographic Assertion...
            </h3>
            <p className="text-xs text-slate-500 mt-1 font-mono">
              Validating HMAC-SHA256 signature against central registry
            </p>
          </div>
        ) : !data || !data.valid ? (
          /* Invalid / Expired / Revoked Card */
          <div className="bg-white border border-[#E2E8F0] rounded overflow-hidden shadow-sm">
            <div className="p-6 text-center border-b border-[#E2E8F0] bg-[#FEF2F2]">
              <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#B91C1C] text-white font-mono font-bold text-xs uppercase tracking-wider mb-2">
                <ShieldAlert className="w-4 h-4 mr-1.5" />
                {data?.status || "UNABLE TO VERIFY"}
              </div>
              <h2 className="text-sm font-bold text-[#0F172A] mt-2">
                Credential Assertion Unavailable
              </h2>
              <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
                {data?.reason ||
                  "This verification link has expired, was revoked by the student, or contains an invalid cryptographic signature."}
              </p>
            </div>

            <div className="p-4 bg-slate-50 text-center text-xs text-slate-500 border-t border-[#E2E8F0]">
              <div className="flex items-center justify-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  Requests must be renewed through an authorized student consent exchange.
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Verified Assertion Card */
          <div className="bg-white border border-[#E2E8F0] rounded overflow-hidden shadow-sm">
            {/* Prominent Verification Badge */}
            <div className="p-6 text-center border-b border-[#E2E8F0] bg-[#F0FDF4]">
              <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#15803D] text-white font-mono font-bold text-xs uppercase tracking-wider shadow-xs">
                <ShieldCheck className="w-4 h-4 mr-1.5" />
                {data.status}
              </div>
              <div className="text-xs font-mono text-slate-600 mt-2">
                Verified against AICTE Central Regulatory Database
              </div>
            </div>

            {/* Permitted Minimal Disclosure Grid (Zero PII, Zero APAAR, Zero DOB) */}
            <div className="p-6 space-y-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold border-b border-[#E2E8F0] pb-2">
                Permitted Disclosure Data
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block mb-0.5">Student Full Name:</span>
                  <span className="text-sm font-bold text-[#0F172A] block">
                    {data.assertion?.student_full_name}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block mb-0.5 flex items-center">
                    <Building2 className="w-3.5 h-3.5 mr-1 text-slate-400" />
                    Enrolled Institution:
                  </span>
                  <span className="font-semibold text-slate-900 block">
                    {data.assertion?.institution_name}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block mb-0.5 flex items-center">
                    <GraduationCap className="w-3.5 h-3.5 mr-1 text-slate-400" />
                    Programme Name:
                  </span>
                  <span className="font-medium text-slate-800 block">
                    {data.assertion?.programme_name}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block mb-0.5 flex items-center">
                    <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
                    Academic Enrolment Year:
                  </span>
                  <span className="font-mono font-medium text-slate-800 block">
                    {data.assertion?.academic_year}
                  </span>
                </div>

                <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                  <span className="text-slate-500 block mb-0.5">Verified Status:</span>
                  <span className="inline-flex items-center text-xs font-semibold text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] px-2.5 py-0.5 rounded font-mono">
                    ✓ {data.assertion?.enrolment_status}
                  </span>
                </div>
              </div>
            </div>

            {/* Cryptographic Assertion Box */}
            <div className="p-6 bg-slate-50 border-t border-[#E2E8F0] space-y-3">
              <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                <span className="flex items-center">
                  <Lock className="w-3.5 h-3.5 mr-1 text-slate-400" />
                  Cryptographic Proof Assertion
                </span>
                <span className="text-[10px] text-slate-400">HMAC-SHA256</span>
              </div>

              {/* Hash Viewport with Copy Button */}
              <div className="relative">
                <div className="bg-[#0F172A] text-slate-200 font-mono text-[11px] p-2.5 rounded border border-slate-800 break-all pr-10">
                  {data.cryptographic_proof?.verification_hash}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      data.cryptographic_proof?.verification_hash || ""
                    )
                  }
                  title="Copy verification hash"
                  className="absolute right-2 top-2 p-1 text-slate-400 hover:text-white transition-colors"
                >
                  {copiedHash ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Assertion Metadata */}
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 font-mono pt-1">
                <div>
                  <span className="text-slate-400 block">Authorized Requester:</span>
                  <span className="font-medium text-slate-800 truncate block">
                    {data.cryptographic_proof?.requester_org}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Token Expiry:</span>
                  <span className="font-semibold text-blue-700 flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    {secondsLeft > 0
                      ? formatCountdown(secondsLeft)
                      : "Expired"}
                  </span>
                </div>
              </div>
            </div>

            {/* Zero-Knowledge Redaction Safety Notice */}
            <div className="p-4 bg-slate-100/70 border-t border-[#E2E8F0] text-[11px] text-slate-500 flex items-start space-x-2">
              <Lock className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Zero-Knowledge Redaction Guarantee:</strong> In strict
                adherence to AICTE privacy directives, student national identity
                keys (APAAR ID), raw database IDs, dates of birth, and home
                addresses are completely redacted from this response.
              </span>
            </div>
          </div>
        )}

        {/* Global Helpline & Governance Footer */}
        <div className="text-center mt-6 text-xs text-slate-400 space-y-1">
          <div>
            All India Council for Technical Education (AICTE) RegTech Gateway
          </div>
          <div className="text-[11px]">
            Statutory Body Under Ministry of Education, Govt. of India
          </div>
        </div>
      </div>
    </div>
  );
}
