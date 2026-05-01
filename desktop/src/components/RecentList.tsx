import { useEffect, useState } from "react";
import { listRecent, type RecentRecording } from "@/lib/api";
import { useSession } from "@/store/session";

const TAG: Record<RecentRecording["status"], { label: string; cls: string }> = {
  ready:        { label: "READY",     cls: "text-ok      bg-ok/[0.1]"  },
  uploading:    { label: "UPLOAD",    cls: "text-warn    bg-warn/[0.1]" },
  transcribing: { label: "TRANSCRIBE",cls: "text-accent  bg-accent/[0.1]" },
  failed:       { label: "FAILED",    cls: "text-rec     bg-rec/[0.1]" },
};

export function RecentList() {
  const token = useSession((s) => s.token);
  const [items, setItems] = useState<RecentRecording[]>([]);

  useEffect(() => {
    if (!token) return;
    listRecent(token).then(setItems).catch(() => setItems([]));
  }, [token]);

  if (items.length === 0) {
    return <p className="text-text-2 text-[13px]">No recordings yet. Press record to make your first.</p>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-2 py-2.5 -mx-2 rounded hover:bg-bg-2">
          <Thumb />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] truncate">{r.title}</p>
            <p className="font-mono text-[10.5px] text-text-2 tracking-wide mt-0.5">
              {Math.round(r.durationMs / 60000)}m · {new Date(r.createdAt).toLocaleDateString().toUpperCase()}
            </p>
          </div>
          <span className={`font-mono text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${TAG[r.status].cls}`}>
            ●&nbsp;{TAG[r.status].label}
          </span>
        </div>
      ))}
    </div>
  );
}

function Thumb() {
  return (
    <div className="w-11 h-7 rounded-sm border border-line-1 bg-gradient-to-br from-bg-3 to-bg-1 relative shrink-0">
      <span className="absolute left-[38%] top-1/2 -translate-y-1/2 border-l-[7px] border-l-text-1 border-y-[5px] border-y-transparent" />
    </div>
  );
}
