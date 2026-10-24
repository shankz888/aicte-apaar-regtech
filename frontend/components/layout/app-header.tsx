"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ShieldCheck, UploadCloud, BarChart3, CheckCircle, Cpu, LogOut } from "lucide-react";
import { GlassIcon } from "@/components/ui/glass-icon";

export const AppHeader: React.FC = () => {
  const pathname = usePathname();
  const isSubmit = pathname?.startsWith("/institution");
  const isOverview = pathname === "/admin/overview";
  const isBenchmark = pathname === "/admin/benchmark";
  const isVerifier = pathname?.startsWith("/verify");
  const isAdmin = isOverview || isBenchmark;
  const role = isAdmin ? { name: "AICTE Central Admin", detail: "National Regulatory Directorate", Icon: ShieldCheck } : isVerifier ? { name: "External Verifier", detail: "Read-only verification portal", Icon: CheckCircle } : { name: "Apex Institute of Tech", detail: "Institution ID | SYN-MH-0001", Icon: Building2 };
  const items = [
    { href: "/institution/submit", label: "Institute", short: "01", Icon: UploadCloud, active: !!isSubmit, detail: "Submission workspace" },
    { href: "/admin/overview", label: "Compliance", short: "02", Icon: BarChart3, active: !!isOverview, detail: "Regulatory overview" },
    { href: "/admin/benchmark", label: "Benchmark", short: "03", Icon: Cpu, active: !!isBenchmark, detail: "Validation scenarios" },
    { href: "/verify/chk_demo8723", label: "Verification", short: "04", Icon: CheckCircle, active: !!isVerifier, detail: "Secure token check" },
  ];

  return <>
    <header className="workspace-topbar">
      <Link href="/" className="workspace-brand" aria-label="APAAR RegTech home"><span className="workspace-brand-mark"><ShieldCheck /></span><span><strong>AICTE REGTECH</strong><small>APAAR ID | Academic Governance</small></span></Link>
      <div className="workspace-topbar-right"><div className="workspace-role"><span className="workspace-role-icon"><role.Icon /></span><span><strong>{role.name}</strong><small>{role.detail}</small></span></div><Link href="/login" className="workspace-switch"><LogOut /> <span>Switch role</span></Link></div>
    </header>
    <aside className="line-sidebar" aria-label="Workspace navigation"><div className="sidebar-caption">WORKSPACE</div><nav>{items.map(({ href, label, short, Icon, active, detail }) => <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`line-sidebar-item ${active ? "is-active" : ""}`}><GlassIcon className="sidebar-icon-glass"><Icon /></GlassIcon><span className="sidebar-item-copy"><strong>{label}</strong><small>{detail}</small></span><span className="sidebar-index">{short}</span></Link>)}</nav><div className="sidebar-status"><i /> <span>Secure environment<br /><small>Role-based access active</small></span></div></aside>
  </>;
};


