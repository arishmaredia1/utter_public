import { S3Client } from "@aws-sdk/client-s3";
import { startCapture, stopCapture, readLevel, type AudioMode, type CaptureBundle } from "./capture";
import { Uploader } from "./uploader";
import type { Secrets } from "@/store/session";

export type SessionState = "idle" | "starting" | "recording" | "stopping" | "completed" | "error";

export interface SessionSnapshot {
  state: SessionState;
  elapsedMs: number;
  level: number;
  sourceLabel: string;
  bytes: number;
  err: string | null;
}

export interface SessionResult {
  r2Key: string;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
}

interface StartArgs {
  secrets: Secrets;
  audioMode: AudioMode;
  onUpdate(s: SessionSnapshot): void;
  /**
   * Optional pre-acquired capture bundle. If provided, the session won't call
   * startCapture() itself. This is required on macOS WKWebView, which only
   * allows getDisplayMedia() inside a user-gesture handler — the click handler
   * in Idle.tsx must do the capture before navigating.
   */
  capture?: CaptureBundle;
}

export class RecorderSession {
  private capture: CaptureBundle | null = null;
  private recorder: MediaRecorder | null = null;
  private uploader: Uploader | null = null;
  private startedAt = 0;
  private rafId: number | null = null;
  private state: SessionState = "idle";
  private bytes = 0;
  private err: string | null = null;
  private level = 0;
  private label = "";
  private resolveResult: ((r: SessionResult) => void) | null = null;
  private rejectResult: ((e: unknown) => void) | null = null;
  private pendingPushes: Promise<void>[] = [];
  private r2Key = "";
  private mimeType = "video/webm";

  async start({ secrets, audioMode, onUpdate, capture }: StartArgs): Promise<SessionResult> {
    if (this.state !== "idle") throw new Error("Already running");
    this.setState("starting", onUpdate);

    try {
      this.capture = capture ?? (await startCapture({ mode: audioMode }));
      this.label = this.capture.sourceLabel;

      // Pick the best codec the host actually supports. Chromium-based hosts
      // (WebView2 on Windows) accept WebM+VP9+Opus; WKWebView on macOS only
      // accepts MP4+H.264+AAC. Fall back through a list and surface a clear
      // error if nothing matches.
      const codecCandidates = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4;codecs=h264,aac",
        "video/mp4;codecs=avc1,mp4a",
        "video/mp4",
      ];
      const mimeType = codecCandidates.find((c) => MediaRecorder.isTypeSupported(c));
      if (!mimeType) {
        throw new Error(
          "MediaRecorder doesn't support any known codec on this platform. WKWebView typically accepts MP4 only.",
        );
      }
      const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
      const contentType = mimeType.startsWith("video/mp4") ? "video/mp4" : "video/webm";
      this.mimeType = contentType;

      const s3 = new S3Client({
        region: secrets.b2Region,
        endpoint: `https://s3.${secrets.b2Region}.backblazeb2.com`,
        credentials: {
          accessKeyId: secrets.r2AccessKeyId,
          secretAccessKey: secrets.r2SecretAccessKey,
        },
      });
      this.r2Key = `recordings/${dateFolder()}/${rid()}.${ext}`;
      this.uploader = new Uploader({ s3, bucket: secrets.r2Bucket, key: this.r2Key, contentType });
      await this.uploader.start();

      const recorder = new MediaRecorder(this.capture.stream, {
        mimeType,
        videoBitsPerSecond: 2_500_000,
      });
      recorder.ondataavailable = (ev) => {
        if (!ev.data || ev.data.size === 0) return;
        this.bytes += ev.data.size;
        const p = this.uploader!.push(ev.data).catch((e) => { this.err = String(e); });
        this.pendingPushes.push(p);
      };
      recorder.onerror = (ev) => {
        this.err = String((ev as ErrorEvent).error ?? "MediaRecorder error");
        this.setState("error", onUpdate);
      };
      this.capture.tracks.forEach((t) => {
        t.addEventListener("ended", () => {
          if (this.state === "recording") void this.stop();
        });
      });

      recorder.start(5000); // emit 5s chunks
      this.recorder = recorder;
      this.startedAt = performance.now();
      this.setState("recording", onUpdate);
      this.tickLevels(onUpdate);
    } catch (e) {
      this.err = String(e);
      await this.cleanupOnFailure();
      this.setState("error", onUpdate);
      throw e;
    }

    return new Promise<SessionResult>((resolve, reject) => {
      this.resolveResult = resolve;
      this.rejectResult = reject;
    });
  }

  async stop(): Promise<void> {
    if (this.state !== "recording") return;
    this.setState("stopping", () => {});
    try {
      const recorder = this.recorder!;
      const stopped = new Promise<void>((res) => { recorder.onstop = () => res(); });
      recorder.stop();
      await stopped;
      await Promise.all(this.pendingPushes);

      const result = await this.uploader!.complete();
      const durationMs = Math.max(0, performance.now() - this.startedAt);
      this.setState("completed", () => {});
      this.cleanup();
      this.resolveResult?.({ r2Key: this.r2Key, durationMs, sizeBytes: result.size, mimeType: this.mimeType });
    } catch (e) {
      this.err = String(e);
      this.rejectResult?.(e);
    }
  }

  async cancel(): Promise<void> {
    try { await this.uploader?.cancel(); } catch { /* ignore */ }
    this.cleanup();
    this.setState("idle", () => {});
  }

  private async cleanupOnFailure() {
    try { await this.uploader?.cancel(); } catch { /* ignore */ }
    this.cleanup();
  }

  private cleanup() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.capture) stopCapture(this.capture);
    this.capture = null;
    this.recorder = null;
    this.uploader = null;
  }

  private setState(s: SessionState, onUpdate: (s: SessionSnapshot) => void) {
    this.state = s;
    onUpdate(this.snapshot());
  }

  private tickLevels(onUpdate: (s: SessionSnapshot) => void) {
    const tick = () => {
      if (this.state !== "recording") return;
      this.level = this.capture ? readLevel(this.capture.analyser) : 0;
      onUpdate(this.snapshot());
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private snapshot(): SessionSnapshot {
    return {
      state: this.state,
      elapsedMs: this.startedAt ? Math.max(0, performance.now() - this.startedAt) : 0,
      level: this.level,
      sourceLabel: this.label,
      bytes: this.bytes,
      err: this.err,
    };
  }
}

function rid(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
}
function dateFolder(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
