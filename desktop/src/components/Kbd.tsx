import type { ReactNode } from "react";
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="font-mono text-[10.5px] bg-bg-2 border border-line-1 border-b-2 text-text-0 px-1.5 py-[1px] rounded mx-0.5">
      {children}
    </kbd>
  );
}
