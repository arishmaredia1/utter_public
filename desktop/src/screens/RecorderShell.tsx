import { useEffect, useRef, useState } from "react";
import { RecorderSession, type SessionSnapshot } from "@/recording/session";
import type { AudioMode } from "@/recording/capture";
import { useSession } from "@/store/session";
import { RecordingPill } from "@/components/RecordingPill";
import { registerRecording, transcribeRecording } from "@/lib/api";

interface Props { mode: AudioMode; onDone(): void }

const initial: SessionSnapshot = { state: "starting", elapsedMs: 0, level: 0, sourceLabel: "", bytes: 0, err: null };

export function RecorderShell({ mode, onDone }: Props) {
  const token = useSession((s) => s.token);
  const secrets = useSession((s) => s.secrets);
  const [snap, setSnap] = useState<SessionSnapshot>(initial);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"recording" | "uploading" | "transcribing" | "done">("recording");
  const sessRef = useRef<RecorderSession | null>(null);

  useEffect(() => {
    if (!token || !secrets) return;
    const sess = new RecorderSession();
    sessRef.current = sess;
    sess.start({ secrets, audioMode: mode, onUpdate: setSnap })
      .then(async (result) => {
        setPhase("uploading");
        const id = await registerRecording(token, {
          title: `Recording — ${new Date().toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
          r2Key: result.r2Key,
          durationMs: Math.round(result.durationMs),
          sizeBytes: result.sizeBytes,
        });
        setPhase("transcribing");
        try { await transcribeRecording(token, id, result.r2Key); } catch { /* shown by status */ }
        setPhase("done");
        setTimeout(onDone, 1200);
      })
      .catch((e) => setError(String(e)));
    return () => {
      sessRef.current?.cancel();
      sessRef.current = null;
    };
  }, [token, secrets, mode, onDone]);

  if (error) {
    const reason = classifyError(error);
    return (
      <main className="min-h-screen grid place-items-center px-6">
        <div className="max-w-lg text-left">
          <p className="font-mono text-[11px] uppercase tracking-wider text-rec mb-3">{reason.kicker}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tighter mb-3">{reason.title}</h1>
          <div className="text-text-1 text-sm leading-relaxed mb-5">{reason.body}</div>
          <details className="mb-6">
            <summary className="font-mono text-[10px] uppercase tracking-wider text-text-2 cursor-pointer hover:text-text-1">Raw error</summary>
            <pre className="font-mono text-[11px] text-text-2 mt-2 whitespace-pre-wrap break-words">{error}</pre>
          </details>
          <button onClick={onDone} className="text-accent hover:text-accent-hover font-mono text-sm">← Back</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative">
      <div
        aria-hidden
        className="absolute inset-0 opacity-25 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
        style={{ backgroundImage: "linear-gradient(#232936 1px, transparent 1px), linear-gradient(90deg, #232936 1px, transparent 1px)", backgroundSize: "32px 32px" }}
      />
      <div className="relative z-10 grid place-items-center min-h-screen">
        <RecordingPill
          elapsedMs={snap.elapsedMs}
          level={snap.level}
          source={snap.sourceLabel || "Window"}
          onStop={() => sessRef.current?.stop()}
        />
        {phase !== "recording" && (
          <p className="mt-6 font-mono text-[11px] uppercase tracking-wider text-text-2">
            {phase === "uploading" && "Finalizing upload…"}
            {phase === "transcribing" && "Transcribing with Groq…"}
            {phase === "done" && <span className="text-ok">● Done</span>}
          </p>
        )}
      </div>
    </main>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

interface FriendlyError {
  kicker: string;
  title: string;
  body: React.ReactNode;
}

function classifyError(raw: string): FriendlyError {
  const msg = raw.toLowerCase();

  if (msg.includes("notallowederror") || msg.includes("permission denied")) {
    if (isMac) {
      return {
        kicker: "Screen recording blocked",
        title: "macOS hasn't given Utter permission to record the screen.",
        body: (
          <div className="space-y-3">
            <p>Two things can cause this:</p>
            <ol className="list-decimal list-inside space-y-2 marker:text-text-2">
              <li>You clicked <strong>Cancel</strong> in the window picker. Just hit record again and pick a window.</li>
              <li>macOS denied screen recording permission for Utter. To fix it:
                <ol className="list-[lower-alpha] list-inside ml-4 mt-1.5 space-y-1 text-text-1">
                  <li>Open <strong>System Settings → Privacy &amp; Security → Screen &amp; System Audio Recording</strong>.</li>
                  <li>Toggle <strong>Utter</strong> on. (If it isn't listed, hit record once so macOS adds it, then come back.)</li>
                  <li><strong>Quit Utter completely</strong> (⌘Q) and reopen — macOS only re-reads permissions on launch.</li>
                </ol>
              </li>
            </ol>
            <p className="text-text-2 text-[12px]">In dev mode the binary path changes each rebuild, so you may need to re-grant after pulling new code.</p>
          </div>
        ),
      };
    }
    return {
      kicker: "Permission denied",
      title: "The browser/OS blocked screen capture.",
      body: <p>Make sure you didn't click Cancel in the picker, and that this window is allowed to capture the screen.</p>,
    };
  }

  if (msg.includes("notfounderror") || msg.includes("no audio") || msg.includes("no video track")) {
    return {
      kicker: "Source unavailable",
      title: "Couldn't find the requested audio or video source.",
      body: (
        <p>
          If you picked <strong>Mic + System</strong> or <strong>System only</strong> on macOS,
          BlackHole needs to be installed AND your Mac's audio output needs to be routed through it.
          Switch to <strong>Mic only</strong> if you just want to test recording.
        </p>
      ),
    };
  }

  if (msg.includes("notreadableerror")) {
    return {
      kicker: "Hardware in use",
      title: "Another app is using your microphone or camera.",
      body: <p>Close any other app that might be holding the mic (Zoom, Teams, OBS, the browser) and try again.</p>,
    };
  }

  return {
    kicker: "Recording error",
    title: "Something went wrong while starting the recording.",
    body: <p>Try again. If it keeps failing, copy the raw error below and check the desktop logs.</p>,
  };
}
