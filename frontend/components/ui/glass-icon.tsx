import type { ReactNode } from "react";

export function GlassIcon({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`reactbits-glass-icon ${className}`} aria-hidden="true">{children}</span>;
}
