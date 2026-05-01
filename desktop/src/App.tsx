import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSession } from "@/store/session";
import { Login } from "@/screens/Login";
import { Idle } from "@/screens/Idle";
import { Onboarding } from "@/screens/Onboarding";
import { RecorderShell } from "@/screens/RecorderShell";
import { startCapture, type AudioMode, type CaptureBundle } from "@/recording/capture";

interface RecordingHandoff {
  mode: AudioMode;
  capture: CaptureBundle;
}

export function App() {
  const token = useSession((s) => s.token);
  const [recording, setRecording] = useState<RecordingHandoff | null>(null);
  const [permsReady, setPermsReady] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    const un = listen("global-record-toggle", () => {
      // Hotkey can't preserve a user gesture for getDisplayMedia.
      // Just bring the window forward; the user clicks the in-app button.
      // (No state change here — it's a no-op for now.)
    });
    return () => { un.then((f) => f()); };
  }, []);

  // CRITICAL: this MUST be called synchronously from a click handler.
  // WKWebView (macOS Safari) requires getDisplayMedia to be invoked while
  // user activation is alive. The await chain preserves activation only
  // up to the first awaited API call, so we capture BEFORE navigating.
  async function handleStart(mode: AudioMode) {
    setStartError(null);
    try {
      const capture = await startCapture({ mode });
      setRecording({ mode, capture });
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      setStartError(msg);
      // Re-throw so Idle's catch sees it (it just swallows — we render the error).
      throw e;
    }
  }

  if (!token) return <Login />;
  if (!permsReady) return <Onboarding onReady={() => setPermsReady(true)} />;
  if (recording) {
    return (
      <RecorderShell
        mode={recording.mode}
        capture={recording.capture}
        onDone={() => setRecording(null)}
      />
    );
  }
  return <Idle onStart={handleStart} startError={startError} />;
}
