import crypto from "crypto";
import { getDb } from "./db";

interface ResetToken {
  email: string;
  token: string;
  expiresAt: Date;
}

async function collection() {
  const db = await getDb();
  const col = db.collection<ResetToken>("password_reset_tokens");
  await col.createIndex({ token: 1 }, { unique: true });
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return col;
}

export async function createResetToken(email: string): Promise<string> {
  const col = await collection();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await col.deleteMany({ email });
  await col.insertOne({ email, token, expiresAt });
  return token;
}

export async function consumeResetToken(token: string): Promise<string | null> {
  const col = await collection();
  const doc = await col.findOneAndDelete({
    token,
    expiresAt: { $gt: new Date() },
  });
  return doc?.email ?? null;
}
