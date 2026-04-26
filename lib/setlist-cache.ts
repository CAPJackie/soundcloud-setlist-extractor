import { getDb } from "./db";

export interface CachedTrack {
  artist: string;
  title: string;
  timestamp?: string;
}

export interface CachedSetlist {
  url: string;
  title: string;
  username: string;
  publishedAt: Date | null;
  cachedAt: Date;
  tracks: CachedTrack[];
}

async function collection() {
  const db = await getDb();
  const col = db.collection<CachedSetlist>("setlists");
  // Ensure unique index on url
  await col.createIndex({ url: 1 }, { unique: true });
  return col;
}

export async function getCachedSetlist(url: string): Promise<CachedSetlist | null> {
  const col = await collection();
  return col.findOne({ url }, { projection: { _id: 0 } });
}

export async function saveSetlist(data: Omit<CachedSetlist, "cachedAt">): Promise<void> {
  const col = await collection();
  await col.updateOne(
    { url: data.url },
    { $set: { ...data, cachedAt: new Date() } },
    { upsert: true }
  );
}
