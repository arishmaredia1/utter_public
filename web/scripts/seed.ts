import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { ObjectId } from "mongodb";
import { getRecordingsCollection, ensureIndexes } from "../lib/db";

async function main() {
  await ensureIndexes();
  const col = await getRecordingsCollection();
  await col.deleteMany({});

  const segments = [
    { start: 0,   end: 4,   text: "Welcome everyone to the design sync." },
    { start: 4,   end: 9,   text: "I want to talk about the recording state — it should feel like a hardware meter." },
    { start: 9,   end: 14,  text: "Mono numbers, blinking light, levels. People know what that means." },
    { start: 14,  end: 21,  text: "Let's pick Bricolage for display and Geist for everything else." },
    { start: 21,  end: 28,  text: "Mono is reserved for timestamps and any technical readout." },
    { start: 28,  end: 34,  text: "We should not center every layout. Asymmetry where it earns it." },
    { start: 34,  end: 40,  text: "And the transcript should feel like a script — a clean ledger of what was said." },
    { start: 40,  end: 50,  text: "Action item: ship the new design system by Friday." },
  ];
  const fullText = segments.map((s) => s.text).join(" ");

  await col.insertMany([
    {
      _id: new ObjectId(),
      title: "Sync with design",
      createdAt: new Date(Date.now() - 2 * 3600 * 1000),
      durationMs: 23 * 60 * 1000 + 14 * 1000,
      sizeBytes: 142_000_000,
      status: "ready",
      r2Key: "seed/sync-with-design.webm",
      r2Bucket: process.env.R2_BUCKET ?? "utter",
      mimeType: "video/webm" as const,
      transcript: { segments, fullText, language: "en", model: "whisper-large-v3" },
      chats: [],
      shareToken: null,
      failureReason: null,
    },
    {
      _id: new ObjectId(),
      title: "Founders standup",
      createdAt: new Date(Date.now() - 26 * 3600 * 1000),
      durationMs: 11 * 60 * 1000 + 8 * 1000,
      sizeBytes: 71_000_000,
      status: "ready",
      r2Key: "seed/founders-standup.webm",
      r2Bucket: process.env.R2_BUCKET ?? "utter",
      mimeType: "video/webm" as const,
      transcript: { segments, fullText, language: "en", model: "whisper-large-v3" },
      chats: [],
      shareToken: null,
      failureReason: null,
    },
    {
      _id: new ObjectId(),
      title: "Investor call · Felicis",
      createdAt: new Date(Date.now() - 4 * 24 * 3600 * 1000),
      durationMs: 42 * 60 * 1000 + 1 * 1000,
      sizeBytes: 240_000_000,
      status: "transcribing",
      r2Key: "seed/investor-call-felicis.webm",
      r2Bucket: process.env.R2_BUCKET ?? "utter",
      mimeType: "video/webm" as const,
      transcript: null,
      chats: [],
      shareToken: null,
      failureReason: null,
    },
  ]);

  console.log("Seeded 3 recordings.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
