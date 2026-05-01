import { MongoClient, type Db, type Collection } from "mongodb";
import type { Recording } from "@utter/shared";

type RecordingDoc = Omit<Recording, "id" | "createdAt" | "transcript" | "chats"> & {
  createdAt: Date;
  transcript: Recording["transcript"] extends infer T ? T : never;
  chats: Array<{ role: "user" | "assistant"; content: string; createdAt: Date }>;
};
export type { RecordingDoc };

let clientPromise: Promise<MongoClient> | null = null;
let dbPromise: Promise<Db> | null = null;

function getClient(): Promise<MongoClient> {
  if (clientPromise) return clientPromise;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const client = new MongoClient(uri, { maxPoolSize: 10 });
  clientPromise = client.connect();
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  if (dbPromise) return dbPromise;
  dbPromise = getClient().then((c) => c.db()); // db name comes from URI
  return dbPromise;
}

export async function getRecordingsCollection(): Promise<Collection<RecordingDoc>> {
  const db = await getDb();
  return db.collection<RecordingDoc>("recordings");
}

export async function ensureIndexes(): Promise<void> {
  const col = await getRecordingsCollection();
  await col.createIndex({ createdAt: -1 }, { name: "createdAt_-1" });
  await col.createIndex(
    { shareToken: 1 },
    { name: "shareToken_1", unique: true, partialFilterExpression: { shareToken: { $type: "string" } } }
  );
}

/** Reset the cached client and db. Tests only. */
export function _resetForTests(): void {
  clientPromise = null;
  dbPromise = null;
}
