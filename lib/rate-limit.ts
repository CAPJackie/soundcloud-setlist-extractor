import { getDb } from "./db";

/** Max extraction starts per user per rolling window. */
export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 5);
export const RATE_LIMIT_WINDOW_SECS = Number(process.env.RATE_LIMIT_WINDOW_SECS ?? 60);

interface RateEvent {
  email: string;
  at: Date;
}

async function collection() {
  const db = await getDb();
  const col = db.collection<RateEvent>("rate_events");
  // TTL: purge events shortly after they fall out of the window.
  await col.createIndex({ at: 1 }, { expireAfterSeconds: RATE_LIMIT_WINDOW_SECS * 2 });
  await col.createIndex({ email: 1, at: 1 });
  return col;
}

/**
 * Records an extraction attempt and returns whether it is within the rate limit.
 * Sliding-window count over the last RATE_LIMIT_WINDOW_SECS seconds, per user.
 */
export async function checkAndRecordRateLimit(email: string): Promise<boolean> {
  const e = email.toLowerCase().trim();
  const col = await collection();
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_SECS * 1000);
  const recent = await col.countDocuments({ email: e, at: { $gte: since } });
  if (recent >= RATE_LIMIT_MAX) return false;
  await col.insertOne({ email: e, at: new Date() });
  return true;
}
