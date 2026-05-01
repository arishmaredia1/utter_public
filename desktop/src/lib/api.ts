import { invoke } from "@tauri-apps/api/core";

export interface RecentRecording {
  id: string;
  title: string;
  createdAt: string;
  durationMs: number;
  status: "uploading" | "transcribing" | "ready" | "failed";
}

export async function listRecent(session: string): Promise<RecentRecording[]> {
  const raw = await invoke<Array<{ id: string; title: string; createdAt: string; durationMs: number; status: string }>>(
    "list_recent",
    { session },
  );
  return raw.map((r) => ({ ...r, status: r.status as RecentRecording["status"] }));
}

export interface RegisterPayload {
  title: string;
  r2Key: string;
  durationMs: number;
  sizeBytes: number;
}

export async function registerRecording(session: string, payload: RegisterPayload): Promise<string> {
  return invoke<string>("register_recording", { session, payload });
}

export async function transcribeRecording(session: string, recordingId: string, r2Key: string): Promise<void> {
  await invoke("transcribe_recording", { session, recordingId, r2Key });
}

export interface BlackHoleStatus {
  supported: boolean;
  installed: boolean;
}

export async function audioCheckBlackHole(): Promise<BlackHoleStatus> {
  return invoke<BlackHoleStatus>("audio_check_blackhole");
}

export async function audioInstallBlackHole(session: string): Promise<void> {
  await invoke("audio_install_blackhole", { session });
}
