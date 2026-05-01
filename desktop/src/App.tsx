import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSession } from "@/store/session";
import { Login } from "@/screens/Login";
import { Idle } from "@/screens/Idle";
import { Onboarding } from "@/screens/Onboarding";
import { RecorderShell } from "@/screens/RecorderShell";
import type { AudioMode } from "@/recording/capture";

export function App() {
  const token = useSession((s) => s.token);
  const [recording, setRecording] = useState<AudioMode | null>(null);
  const [permsReady, setPermsReady] = useState(false);

  useEffect(() => {
    const un = listen("global-record-toggle", () => {
      setRecording((curr) => (curr ? curr : "both"));
    });
    return () => { un.then((f) => f()); };
  }, []);

  if (!token) return <Login />;
  if (!permsReady) return <Onboarding onReady={() => setPermsReady(true)} />;
  if (recording) return <RecorderShell mode={recording} onDone={() => setRecording(null)} />;
  return <Idle onStart={(m) => setRecording(m)} />;
}
