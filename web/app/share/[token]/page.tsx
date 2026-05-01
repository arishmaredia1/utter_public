import { notFound } from "next/navigation";
import { getRecordingByShareToken } from "@/lib/recordings";
import { getSignedPlaybackUrl } from "@/lib/r2";
import { Public } from "./Public";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rec = await getRecordingByShareToken(token);
  if (!rec) notFound();
  const videoUrl = await getSignedPlaybackUrl(rec.r2Key);
  return <Public recording={rec} videoUrl={videoUrl} />;
}
