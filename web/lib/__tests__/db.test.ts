import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { getDb, getRecordingsCollection, ensureIndexes, _resetForTests } from "../db";

let mem: MongoMemoryServer;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri("utter-test");
  _resetForTests();
});

afterAll(async () => {
  _resetForTests();
  await mem.stop();
});

describe("db", () => {
  it("connects and returns a singleton client", async () => {
    const a = await getDb();
    const b = await getDb();
    expect(a).toBe(b);
  });
  it("exposes the recordings collection", async () => {
    const col = await getRecordingsCollection();
    expect(col.collectionName).toBe("recordings");
  });
  it("ensures the expected indexes", async () => {
    await ensureIndexes();
    const col = await getRecordingsCollection();
    const idx = await col.indexes();
    const names = idx.map((i) => i.name).sort();
    expect(names).toContain("createdAt_-1");
    expect(names).toContain("shareToken_1");
  });
});
