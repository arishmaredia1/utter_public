import { notFound } from "next/navigation";
import { getRecording } from "@/lib/recordings";
import { getSignedPlaybackUrl } from "@/lib/r2";
import { Detail } from "./Detail";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function RecordingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getRecording(id);
  if (!rec) notFound();
  const videoUrl = await getSignedPlaybackUrl(rec.r2Key);
  return (
    <div className="grid grid-cols-[220px_1fr] min-h-screen">
      <Sidebar active="recordings" />
      <Detail recording={rec} videoUrl={videoUrl} />
    </div>
  );
}
