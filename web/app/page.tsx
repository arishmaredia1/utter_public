import { Sidebar } from "@/components/Sidebar";
import { RecordingsTable } from "@/components/RecordingsTable";
import { listRecordings } from "@/lib/recordings";
import { formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const recordings = await listRecordings();
  const totalMs = recordings.reduce((acc, r) => acc + r.durationMs, 0);
  return (
    <div className="grid grid-cols-[220px_1fr] min-h-screen">
      <Sidebar active="recordings" />
      <main className="px-10 py-8">
        <header className="flex items-end justify-between mb-7">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-text-2 mb-1">
              {recordings.length} recordings · {formatDuration(totalMs)} total
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tighter">Recordings</h1>
          </div>
          <label className="flex items-center gap-2 bg-bg-1 border border-line-1 rounded px-2.5 py-1.5 w-[280px]">
            <span className="text-text-2">⌕</span>
            <input
              placeholder="Search transcripts and titles…"
              className="bg-transparent outline-none text-[13px] flex-1 placeholder:text-text-2"
            />
            <kbd className="font-mono text-[10px] text-text-2 bg-bg-2 border border-line-1 px-1.5 py-px rounded-sm">⌘ K</kbd>
          </label>
        </header>
        <RecordingsTable recordings={recordings} />
      </main>
    </div>
  );
}
