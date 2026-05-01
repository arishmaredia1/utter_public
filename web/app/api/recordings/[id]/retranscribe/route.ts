import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getRecordingsCollection } from "@/lib/db";
import { transcribeWithGroq } from "@/lib/transcribe";

export const runtime = "nodejs";
export const maxDuration = 300; // up to 5 minutes for big files

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const col = await getRecordingsCollection();
  const doc = await col.findOne({ _id: new ObjectId(id) });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await col.updateOne({ _id: doc._id }, { $set: { status: "transcribing", failureReason: null } });
  try {
    const transcript = await transcribeWithGroq(doc.r2Key);
    await col.updateOne({ _id: doc._id }, { $set: { transcript, status: "ready" } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    await col.updateOne({ _id: doc._id }, { $set: { status: "failed", failureReason: (e as Error).message } });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
