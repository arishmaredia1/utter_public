interface Props { level: number /* 0..1 */ }

const BARS = 5;

export function LevelMeter({ level }: Props) {
  // Map level (RMS, typically 0..0.3) into per-bar heights with a little jitter.
  const heights = Array.from({ length: BARS }, (_, i) => {
    const phase = i / BARS;
    const eased = Math.min(1, level * 4);
    const wobble = Math.sin(performance.now() / 80 + phase * 6.28) * 0.15;
    return Math.max(0.15, Math.min(1, eased + wobble));
  });
  return (
    <div className="flex gap-[2px] items-end h-[18px]">
      {heights.map((h, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-[1px] ${i === 2 ? "bg-accent" : "bg-text-2"}`}
          style={{ height: `${Math.round(h * 100)}%`, transition: "height 80ms linear" }}
        />
      ))}
    </div>
  );
}
