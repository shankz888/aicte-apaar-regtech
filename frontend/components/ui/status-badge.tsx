"use client";

import React from "react";

export type StatusType =
  | "accepted"
  | "flagged"
  | "rejected"
  | "blocking"
  | "warning"
  | "info"
  | "completed"
  | "failed"
  | "validating";

interface StatusBadgeProps {
  status: StatusType | string;
  className?: string;
  size?: "sm" | "md";
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className = "",
  size = "md",
}) => {
  const normalized = (status || "").toLowerCase().trim();

  let colorClasses = "border-white/15 bg-white/[0.06] text-slate-200";
  let dotClasses = "bg-slate-400";
  let label = (status || "Unknown").replace(/[_-]+/g, " ").toUpperCase();

  switch (normalized) {
    case "accepted":
      colorClasses = "border-emerald-300/25 bg-emerald-400/10 text-emerald-200";
      dotClasses = "bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.7)]";
      label = "ACCEPTED";
      break;
    case "flagged":
    case "warning":
      colorClasses = "border-amber-200/25 bg-amber-300/10 text-amber-100";
      dotClasses = "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.65)]";
      label = normalized === "warning" ? "WARNING" : "FLAGGED";
      break;
    case "rejected":
    case "blocking":
    case "failed":
      colorClasses = "border-rose-300/25 bg-rose-400/10 text-rose-200";
      dotClasses = "bg-rose-300 shadow-[0_0_8px_rgba(253,164,175,0.65)]";
      label = normalized === "blocking" ? "BLOCKING" : normalized === "failed" ? "FAILED" : "REJECTED";
      break;
    case "validating":
      colorClasses = "border-sky-300/25 bg-sky-300/10 text-sky-200";
      dotClasses = "bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.7)] motion-safe:animate-pulse";
      label = "VALIDATING";
      break;
    case "completed":
      colorClasses = "border-emerald-300/25 bg-emerald-400/10 text-emerald-200";
      dotClasses = "bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.7)]";
      label = "COMPLETED";
      break;
    case "info":
      colorClasses = "border-violet-300/25 bg-violet-400/10 text-violet-200";
      dotClasses = "bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,0.65)]";
      label = "INFO";
      break;
    default:
      break;
  }

  const sizeClasses =
    size === "sm"
      ? "min-h-5 px-2 text-[10px]"
      : "min-h-6 px-2.5 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-mono font-semibold tracking-[0.08em] ${sizeClasses} ${colorClasses} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClasses}`}
      />
      {label}
    </span>
  );
};
