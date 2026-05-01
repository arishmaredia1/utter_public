import type { AudioMode } from "@/recording/capture";

interface Props { value: AudioMode; onChange(v: AudioMode): void; isMac: boolean }

const OPTIONS: Array<{ id: AudioMode; name: string; desc: (mac: boolean) => string }> = [
  { id: "mic", name: "Mic only", desc: () => "Your voice from the system mic." },
  { id: "both", name: "Mic + System", desc: (mac) => mac ? "You and the meeting. Needs BlackHole on macOS." : "You and the meeting." },
  { id: "system", name: "System only", desc: (mac) => mac ? "Just the meeting audio. Needs BlackHole on macOS." : "Just the meeting audio." },
];

export function AudioSourceSelector({ value, onChange, isMac }: Props) {
  return (
    <div>
      <div className="font-mono text-[10.5px] uppercase tracking-widest text-text-2 mb-2.5">Audio source</div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => {
          const active = o.id === value;
          return (
            <button key={o.id} type="button" onClick={() => onChange(o.id)}
              className={`text-left p-3.5 rounded-md border transition-colors relative ${
                active
                  ? "border-accent bg-gradient-to-b from-accent/[0.12] to-transparent"
                  : "bg-bg-2 border-line-1 hover:border-line-2"
              }`}>
              {active && <span className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--tw-shadow-color)] shadow-accent" />}
              <p className="font-semibold text-[13.5px] mb-1">{o.name}</p>
              <p className="text-[11.5px] text-text-1 leading-snug">{o.desc(isMac)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
