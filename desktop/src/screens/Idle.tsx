import { useState } from "react";
import { Titlebar } from "@/components/Titlebar";
import { AudioSourceSelector } from "@/components/AudioSourceSelector";
import { RecentList } from "@/components/RecentList";
import { Kbd } from "@/components/Kbd";
import type { AudioMode } from "@/recording/capture";

interface Props { onStart(mode: AudioMode): void }

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

export function Idle({ onStart }: Props) {
  const [mode, setMode] = useState<AudioMode>("both");

  return (
    <div className="min-h-screen flex flex-col">
      <Titlebar />
      <div className="grid grid-cols-[1fr_360px] flex-1">
        <section className="px-14 py-12 flex flex-col gap-9">
          <span className="font-mono text-[10.5px] uppercase tracking-widest text-text-2">Ready</span>
          <h1 className="font-display text-[44px] leading-[1.05] tracking-tightest font-semibold max-w-[14ch] m-0">
            Press record. <em className="not-italic text-accent">Pick a window.</em> The rest is automatic.
          </h1>
          <div className="flex items-center gap-6">
            <button
              onClick={() => onStart(mode)}
              aria-label="Start recording"
              className="w-24 h-24 rounded-full relative cursor-pointer border border-rec/40 transition-transform hover:scale-[1.03] focus:outline-none"
              style={{
                background: "radial-gradient(circle at 35% 30%, #FF6770, #C42730)",
                boxShadow: `
                  0 0 0 6px rgba(255,77,88,.08),
                  0 18px 36px -12px rgba(255,77,88,.4),
                  inset 0 1px 0 rgba(255,255,255,.2),
                  inset 0 -10px 20px rgba(0,0,0,.3)`,
              }}
            >
              <span className="absolute inset-[32%] rounded-md bg-white/95" />
            </button>
            <div>
              <p className="font-display font-semibold text-[22px] tracking-tighter mb-1">Start recording</p>
              <p className="text-text-1 text-[13px]">Or press <Kbd>⌘</Kbd><Kbd>⇧</Kbd><Kbd>R</Kbd> from anywhere.</p>
            </div>
          </div>
          <AudioSourceSelector value={mode} onChange={setMode} isMac={isMac} />
        </section>

        <aside className="border-l border-line-1 bg-black/[0.15] p-7 flex flex-col gap-5">
          <header className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-widest text-text-2">
            <span>Recent</span>
            <span className="text-accent text-[12px] tracking-normal normal-case font-sans">All →</span>
          </header>
          <RecentList />
          <footer className="mt-auto pt-4 border-t border-line-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-text-2">
            <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-ok mr-1.5 align-middle shadow-[0_0_8px_var(--tw-shadow-color)] shadow-ok" />R2 Online</span>
            <span>38ms</span>
          </footer>
        </aside>
      </div>
    </div>
  );
}
