export function Titlebar() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-line-1 bg-black/[0.2]">
      <div className="flex gap-2">
        <span className="w-3 h-3 rounded-full bg-bg-3" />
        <span className="w-3 h-3 rounded-full bg-bg-3" />
        <span className="w-3 h-3 rounded-full bg-bg-3" />
      </div>
      <span className="font-mono text-[11px] uppercase tracking-wider text-text-2">UTTER · Desktop</span>
    </div>
  );
}
