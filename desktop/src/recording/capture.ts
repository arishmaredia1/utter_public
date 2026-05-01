export type AudioMode = "mic" | "system" | "both";

export interface CaptureBundle {
  /** The combined stream that will be fed into MediaRecorder. */
  stream: MediaStream;
  /** Underlying tracks so callers can stop them on stop(). */
  tracks: MediaStreamTrack[];
  /** Source label captured from the OS picker (best effort). */
  sourceLabel: string;
  /** Web Audio context and analyser for level metering. */
  audioContext: AudioContext;
  analyser: AnalyserNode;
}

interface CaptureOptions {
  mode: AudioMode;
}

export async function startCapture({ mode }: CaptureOptions): Promise<CaptureBundle> {
  // 1. Display (video + system audio when available)
  const wantSystemAudio = mode === "system" || mode === "both";
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "window", frameRate: 30 } as MediaTrackConstraints,
    audio: wantSystemAudio,
  });

  // 2. Mic if requested
  let mic: MediaStream | null = null;
  if (mode === "mic" || mode === "both") {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  }

  // 3. Mix audio via Web Audio
  const audioContext = new AudioContext();
  const dest = audioContext.createMediaStreamDestination();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  const tap = audioContext.createGain(); // tap to feed analyser
  tap.gain.value = 1;
  tap.connect(dest);
  tap.connect(analyser);

  const tracks: MediaStreamTrack[] = [];
  const videoTrack = display.getVideoTracks()[0];
  if (!videoTrack) throw new Error("No video track from getDisplayMedia");
  tracks.push(videoTrack);

  const sysAudioTrack = display.getAudioTracks()[0] ?? null;
  if (sysAudioTrack && wantSystemAudio) {
    const sysSrc = audioContext.createMediaStreamSource(new MediaStream([sysAudioTrack]));
    sysSrc.connect(tap);
    tracks.push(sysAudioTrack);
  }
  if (mic) {
    const micTrack = mic.getAudioTracks()[0]!;
    const micSrc = audioContext.createMediaStreamSource(new MediaStream([micTrack]));
    micSrc.connect(tap);
    tracks.push(micTrack);
  }

  const mixedAudioTrack = dest.stream.getAudioTracks()[0]!;
  const stream = new MediaStream([videoTrack, mixedAudioTrack]);

  const sourceLabel = videoTrack.label || "Window";
  return { stream, tracks, sourceLabel, audioContext, analyser };
}

export function stopCapture(b: CaptureBundle) {
  for (const t of b.tracks) t.stop();
  b.audioContext.close().catch(() => {});
}

/** RMS of a single frame of analyser data, normalized to [0, 1]. */
export function readLevel(analyser: AnalyserNode): number {
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i]! - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}
