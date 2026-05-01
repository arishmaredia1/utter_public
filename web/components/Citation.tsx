"use client";
export function Citation({ label, seconds, onClick }: { label: string; seconds: number; onClick: (s: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(seconds)}
      className="inline-flex items-center font-mono text-[10.5px] tracking-wide tabular-nums text-accent bg-accent/[0.12] border border-accent/25 px-1.5 py-px rounded mx-0.5 hover:bg-accent/20 transition-colors"
    >
      [{label}]
    </button>
  );
}
