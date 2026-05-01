import type { ReactNode } from "react";
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-widest text-text-2">
      <span className="block w-6 h-px bg-line-2" />
      {children}
    </span>
  );
}
