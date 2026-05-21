import { ObjectId } from "mongodb";
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
  searchedBy?: string[];
}

async function collection() {
  const db = await getDb();
  const col = db.collection<CachedSetlist>("setlists");
  await col.createIndex({ url: 1 }, { unique: true });
  await col.createIndex({ searchedBy: 1 });
  return col;
}

export async function getCachedSetlist(url: string): Promise<CachedSetlist | null> {
  const col = await collection();
  return col.findOne({ url }, { projection: { _id: 0 } });
}

export async function saveSetlist(
  data: Omit<CachedSetlist, "cachedAt" | "searchedBy">,
  userEmail?: string
): Promise<void> {
  const col = await collection();
  await col.updateOne(
    { url: data.url },
    {
      $set: { ...data, cachedAt: new Date() },
      ...(userEmail ? { $addToSet: { searchedBy: userEmail } } : {}),
    },
    { upsert: true }
  );
}

export async function getSetlistById(
  id: string
): Promise<(CachedSetlist & { _id: ObjectId }) | null> {
  try {
    const col = await collection();
    return col.findOne({ _id: new ObjectId(id) }) as Promise<(CachedSetlist & { _id: ObjectId }) | null>;
  } catch {
    return null;
  }
}

export async function getAllSetlists() {
  const col = await collection();
  return col
    .aggregate([
      {
        $project: {
          title: 1,
          username: 1,
          publishedAt: 1,
          cachedAt: 1,
          trackCount: { $size: "$tracks" },
        },
      },
      { $sort: { cachedAt: -1 } },
    ])
    .toArray();
}

export async function getSetlistsByUser(email: string) {
  const col = await collection();
  return col
    .aggregate([
      { $match: { searchedBy: email } },
      {
        $project: {
          title: 1,
          username: 1,
          publishedAt: 1,
          cachedAt: 1,
          trackCount: { $size: "$tracks" },
        },
      },
      { $sort: { cachedAt: -1 } },
    ])
    .toArray();
}

export async function backfillSearchedBy(email: string): Promise<number> {
  const col = await collection();
  const result = await col.updateMany(
    { searchedBy: { $exists: false } },
    { $set: { searchedBy: [email] } }
  );
  return result.modifiedCount;
}
