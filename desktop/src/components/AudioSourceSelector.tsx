import { useEffect, useState } from "react";
import type { AudioMode } from "@/recording/capture";
import { audioCheckBlackHole, audioInstallBlackHole, type BlackHoleStatus } from "@/lib/api";
import { useSession } from "@/store/session";

interface Props { value: AudioMode; onChange(v: AudioMode): void; isMac: boolean }

const OPTIONS: Array<{ id: AudioMode; name: string; desc: (mac: boolean) => string; needsBlackHole: boolean }> = [
  { id: "mic",    name: "Mic only",    desc: () => "Your voice from the system mic.",       needsBlackHole: false },
  { id: "both",   name: "Mic + System", desc: (mac) => mac ? "You and the meeting." : "You and the meeting.", needsBlackHole: true },
  { id: "system", name: "System only",  desc: (mac) => mac ? "Just the meeting audio."     : "Just the meeting audio.", needsBlackHole: true },
];

export function AudioSourceSelector({ value, onChange, isMac }: Props) {
  const token = useSession((s) => s.token);
  const [status, setStatus] = useState<BlackHoleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try { setStatus(await audioCheckBlackHole()); } catch { /* ignore */ }
  }

  useEffect(() => { refresh(); }, []);

  async function install() {
    if (!token) return;
    setErr(null); setBusy(true);
    try {
      await audioInstallBlackHole(token);
      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const showSetup = isMac && status?.supported && !status.installed;

  return (
    <div>
      <div className="font-mono text-[10.5px] uppercase tracking-widest text-text-2 mb-2.5">Audio source</div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => {
          const active = o.id === value;
          const needsSetup = isMac && o.needsBlackHole && status?.supported && !status.installed;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              className={`text-left p-3.5 rounded-md border transition-colors relative ${
                active
                  ? "border-accent bg-gradient-to-b from-accent/[0.12] to-transparent"
                  : "bg-bg-2 border-line-1 hover:border-line-2"
              }`}
            >
              {active && <span className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--tw-shadow-color)] shadow-accent" />}
              <p className="font-semibold text-[13.5px] mb-1">{o.name}</p>
              <p className="text-[11.5px] text-text-1 leading-snug mb-2">{o.desc(isMac)}</p>
              {isMac && o.needsBlackHole && status && (
                needsSetup ? (
                  <span className="font-mono text-[9.5px] uppercase tracking-wider text-warn">● Setup needed</span>
                ) : status.installed ? (
                  <span className="font-mono text-[9.5px] uppercase tracking-wider text-ok">● BlackHole ready</span>
                ) : null
              )}
            </button>
          );
        })}
      </div>

      {showSetup && (
        <div className="mt-3 p-3 rounded-md border border-line-1 bg-bg-2 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-[12.5px] mb-0.5">macOS doesn't let apps record system audio directly.</p>
            <p className="text-[11px] text-text-2">One click installs BlackHole (free, open-source). You'll see a system password prompt.</p>
            {err && <p className="font-mono text-[10px] uppercase tracking-wider text-rec mt-1.5">{err}</p>}
          </div>
          <button
            type="button"
            onClick={install}
            disabled={busy}
            className="h-8 px-3 rounded text-xs font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Installing…" : "Install BlackHole"}
          </button>
        </div>
      )}
    </div>
  );
}
