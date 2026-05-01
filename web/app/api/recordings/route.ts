import { NextResponse } from "next/server";
import { listRecordings } from "@/lib/recordings";

export async function GET() {
  const recs = await listRecordings();
  return NextResponse.json({ recordings: recs });
}
