import { NextResponse } from "next/server";
import { getRecordingByShareToken } from "@/lib/recordings";
import { getSignedPlaybackUrl } from "@/lib/r2";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rec = await getRecordingByShareToken(token);
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = await getSignedPlaybackUrl(rec.r2Key);
  // Strip chat history and r2 details from response
  const { chats: _c, r2Bucket: _b, r2Key: _k, failureReason: _f, ...safe } = rec;
  return NextResponse.json({ recording: safe, videoUrl: url });
}
