import { NextResponse } from "next/server";
import { getRecording } from "@/lib/recordings";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getRecording(id);
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ recording: rec });
}
