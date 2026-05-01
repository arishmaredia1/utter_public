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
    return (
      <main className="min-h-screen grid place-items-center px-6">
        <div className="max-w-md text-center">
          <p className="font-mono text-[11px] uppercase tracking-wider text-rec mb-3">Recording error</p>
          <h1 className="font-display text-3xl font-semibold tracking-tighter mb-3">{error}</h1>
          <button onClick={onDone} className="text-accent hover:text-accent-hover">← Back</button>
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
