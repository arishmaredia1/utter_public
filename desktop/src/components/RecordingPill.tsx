import { LevelMeter } from "./LevelMeter";
import { Button } from "./Button";

interface Props {
  elapsedMs: number;
  level: number;
  source: string;
  onStop(): void;
}

export function RecordingPill({ elapsedMs, level, source, onStop }: Props) {
  return (
    <div className="rounded-full border border-line-2 bg-bg-1/85 backdrop-blur px-4 py-2.5 flex items-center gap-3.5 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.6)]">
      <span className="w-2 h-2 rounded-full bg-rec animate-[pulse-rec_1.4s_ease-in-out_infinite] shadow-[0_0_12px_var(--tw-shadow-color)] shadow-rec" />
      <span className="font-mono text-sm tabular-nums tracking-wide">{formatHms(elapsedMs)}</span>
      <LevelMeter level={level} />
      <span className="w-px h-4 bg-line-2" />
      <span className="font-mono text-[10.5px] uppercase tracking-widest text-text-2 max-w-[160px] truncate">{source}</span>
      <Button variant="danger" size="sm" onClick={onStop}>■ Stop</Button>
    </div>
  );
}

function formatHms(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
function pad(n: number) { return n.toString().padStart(2, "0"); }
