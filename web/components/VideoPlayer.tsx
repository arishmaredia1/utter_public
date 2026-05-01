"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface VideoPlayerHandle {
  seekTo(seconds: number): void;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, {
  src: string;
  onTimeUpdate?: (s: number) => void;
}>(function VideoPlayer({ src, onTimeUpdate }, ref) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [errored, setErrored] = useState(false);

  useImperativeHandle(ref, () => ({
    seekTo(seconds: number) {
      const v = videoRef.current; if (!v) return;
      v.currentTime = seconds;
      v.play().catch(() => {});
    },
  }), []);

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    function onTime() { onTimeUpdate?.(v!.currentTime); }
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [onTimeUpdate]);

  return (
    <div className="aspect-video border border-line-1 rounded-lg overflow-hidden relative bg-gradient-to-br from-bg-3 to-bg-1">
      {errored ? (
        <div className="absolute inset-0 grid place-items-center text-text-1 text-sm">Failed to load video.</div>
      ) : (
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full"
          controls
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
});
