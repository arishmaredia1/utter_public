import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { getRecordingsCollection, _resetForTests, ensureIndexes } from "../db";
import { listRecordings, getRecording, getRecordingByShareToken, mintShareToken, revokeShareToken, appendChatTurn } from "../recordings";

let mem: MongoMemoryServer;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri("utter-test");
  _resetForTests();
  await ensureIndexes();
});

afterAll(async () => {
  _resetForTests();
  await mem.stop();
});

beforeEach(async () => {
  const col = await getRecordingsCollection();
  await col.deleteMany({});
});

async function seedOne(title: string, when: Date) {
  const col = await getRecordingsCollection();
  const r = await col.insertOne({
    title,
    createdAt: when,
    durationMs: 60_000,
    sizeBytes: 1024,
    status: "ready",
    r2Key: "k",
    r2Bucket: "b",
    mimeType: "video/webm",
    transcript: { segments: [{ start: 0, end: 1, text: "hi" }], fullText: "hi", language: "en", model: "whisper-large-v3" },
    chats: [],
    shareToken: null,
    failureReason: null,
  });
  return r.insertedId.toHexString();
}

describe("recordings repo", () => {
  it("lists in reverse chronological order", async () => {
    await seedOne("a", new Date("2026-01-01"));
    await seedOne("b", new Date("2026-02-01"));
    const all = await listRecordings();
    expect(all.map((r) => r.title)).toEqual(["b", "a"]);
  });

  it("getRecording returns a single record by id with ISO dates", async () => {
    const id = await seedOne("a", new Date("2026-01-01"));
    const got = await getRecording(id);
    expect(got?.title).toBe("a");
    expect(got?.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns null for unknown id", async () => {
    expect(await getRecording("000000000000000000000000")).toBeNull();
  });

  it("mints a share token, finds by token, and revokes", async () => {
    const id = await seedOne("a", new Date());
    const token = await mintShareToken(id);
    expect(token).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const found = await getRecordingByShareToken(token);
    expect(found?.id).toBe(id);
    await revokeShareToken(id);
    expect(await getRecordingByShareToken(token)).toBeNull();
  });

  it("appends chat turns", async () => {
    const id = await seedOne("a", new Date());
    await appendChatTurn(id, { role: "user", content: "What was decided?" });
    await appendChatTurn(id, { role: "assistant", content: "Many things [00:01:00]." });
    const got = await getRecording(id);
    expect(got!.chats).toHaveLength(2);
    expect(got!.chats[0]!.role).toBe("user");
    expect(typeof got!.chats[0]!.createdAt).toBe("string");
  });
});
