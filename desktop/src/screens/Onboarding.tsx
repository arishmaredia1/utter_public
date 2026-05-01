import { useEffect, useState } from "react";
import {
  permissionsCheck,
  permissionsRequestScreen,
  permissionsOpenScreenSettings,
  relaunchApp,
  type PermissionStatus,
} from "@/lib/api";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";

interface Props {
  onReady(): void;
}

type Stage = "checking" | "needs-grant" | "ready";

export function Onboarding({ onReady }: Props) {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const [stage, setStage] = useState<Stage>("checking");
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);

  // Initial check + 1.5s polling while waiting
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const s = await permissionsCheck();
        if (cancelled) return;
        setStatus(s);
        if (!s.mac || s.screenRecording === "granted") {
          setStage("ready");
          onReady();
          return;
        }
        setStage("needs-grant");
      } catch {
        /* ignore — try again */
      }
      if (!cancelled) timer = setTimeout(tick, 1500);
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [onReady]);

  async function handleRequest() {
    setBusy(true);
    try {
      // First call triggers the native prompt. Subsequent calls just return the state.
      await permissionsRequestScreen();
      setRequested(true);
      const s = await permissionsCheck();
      setStatus(s);
      if (s.screenRecording === "granted") {
        setStage("ready");
        onReady();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenSettings() {
    setBusy(true);
    try { await permissionsOpenScreenSettings(); } finally { setBusy(false); }
  }

  async function handleRelaunch() {
    setBusy(true);
    try { await relaunchApp(); } finally { setBusy(false); }
  }

  if (stage === "checking" || stage === "ready" || !status) {
    return (
      <main className="min-h-screen grid place-items-center px-6">
        <p className="font-mono text-[11px] uppercase tracking-wider text-text-2">Checking permissions…</p>
      </main>
    );
  }

  // stage === "needs-grant", on macOS, screen recording denied
  return (
    <main className="min-h-screen grid place-items-center px-6 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-25 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
        style={{
          backgroundImage:
            "linear-gradient(#232936 1px, transparent 1px), linear-gradient(90deg, #232936 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative z-10 w-full max-w-lg">
        <div className="flex items-center gap-2.5 mb-6">
          <Logo size={28} />
          <span className="font-display font-semibold text-lg tracking-tighter">Utter</span>
        </div>

        <p className="font-mono text-[10.5px] uppercase tracking-widest text-text-2 mb-3">One quick setup</p>
        <h1 className="font-display text-3xl font-semibold tracking-tighter mb-4">
          macOS needs your permission to record the screen.
        </h1>
        <p className="text-text-1 text-[14px] leading-relaxed mb-7">
          Utter records the window you choose — Zoom, Meet, anything. macOS gates this behind a
          system permission. Pick the path that matches you below.
        </p>

        {!requested ? (
          <Step
            num={1}
            title="Grant Screen Recording permission"
            body="Click below. macOS will show a system dialog. Click Allow."
          >
            <Button onClick={handleRequest} disabled={busy}>
              {busy ? "Requesting…" : "Request permission"}
            </Button>
          </Step>
        ) : (
          <>
            <Step
              num={1}
              title="Open Settings → toggle Utter on"
              body="Find Utter in the list and turn it on. If it's not there yet, return here and click Request again."
            >
              <Button variant="ghost" onClick={handleOpenSettings} disabled={busy}>
                Open System Settings
              </Button>
            </Step>
            <Step
              num={2}
              title="Quit and relaunch Utter"
              body="macOS only re-reads screen recording permission on launch."
            >
              <Button onClick={handleRelaunch} disabled={busy}>
                {busy ? "Relaunching…" : "Relaunch Utter"}
              </Button>
            </Step>
          </>
        )}

        <p className="mt-8 font-mono text-[10px] uppercase tracking-widest text-text-2">
          Polling permissions every 1.5s — this screen disappears the moment it flips to granted.
        </p>
      </div>
    </main>
  );
}

function Step({
  num,
  title,
  body,
  children,
}: {
  num: number;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-md bg-bg-1 border border-line-1 mb-3">
      <span className="font-mono text-[11px] uppercase tracking-wider text-text-2 w-5 mt-0.5">{num.toString().padStart(2, "0")}</span>
      <div className="flex-1">
        <p className="text-[14px] font-semibold mb-1">{title}</p>
        <p className="text-text-1 text-[12.5px] leading-snug mb-3">{body}</p>
        {children}
      </div>
    </div>
  );
}
