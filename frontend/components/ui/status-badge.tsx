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

  let colorClasses = "bg-slate-100 text-slate-700 border-slate-300";
  let label = status.toUpperCase();

  switch (normalized) {
    case "accepted":
      colorClasses = "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]";
      label = "ACCEPTED";
      break;
    case "flagged":
    case "warning":
      colorClasses = "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]";
      label = normalized === "warning" ? "WARNING" : "FLAGGED";
      break;
    case "rejected":
    case "blocking":
    case "failed":
      colorClasses = "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]";
      label = normalized === "blocking" ? "BLOCKING" : normalized === "failed" ? "FAILED" : "REJECTED";
      break;
    case "validating":
      colorClasses = "bg-blue-50 text-[#1D4ED8] border-blue-200 animate-pulse";
      label = "VALIDATING";
      break;
    case "completed":
      colorClasses = "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]";
      label = "COMPLETED";
      break;
    default:
      colorClasses = "bg-slate-100 text-slate-700 border-slate-300";
      break;
  }

  const sizeClasses =
    size === "sm"
      ? "text-[11px] px-2 py-0.5"
      : "text-xs px-2.5 py-1";

  return (
    <span
      className={`inline-flex items-center font-mono font-semibold tracking-wide uppercase rounded border ${sizeClasses} ${colorClasses} ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
          normalized === "accepted" || normalized === "completed"
            ? "bg-[#15803D]"
            : normalized === "flagged" || normalized === "warning"
            ? "bg-[#B45309]"
            : normalized === "validating"
            ? "bg-[#1D4ED8]"
            : "bg-[#B91C1C]"
        }`}
      />
      {label}
    </span>
  );
};
