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
        </header>
        <RecordingsTable recordings={recordings} />
      </main>
    </div>
  );
}
