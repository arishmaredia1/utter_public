import { NextResponse } from "next/server";
import { getRecording } from "@/lib/recordings";
import { getSignedPlaybackUrl } from "@/lib/r2";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getRecording(id);
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = await getSignedPlaybackUrl(rec.r2Key);
  return NextResponse.json({ url, expiresAt: new Date(Date.now() + 6 * 3600 * 1000).toISOString() });
}
