import { getDb } from "./db";

export interface User {
  email: string;
  passwordHash: string;
  createdAt: Date;
}

async function collection() {
  const db = await getDb();
  const col = db.collection<User>("users");
  await col.createIndex({ email: 1 }, { unique: true });
  return col;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const col = await collection();
  return col.findOne({ email: email.toLowerCase().trim() }, { projection: { _id: 0 } });
}

export async function createUser(email: string, passwordHash: string): Promise<void> {
  const col = await collection();
  await col.insertOne({
    email: email.toLowerCase().trim(),
    passwordHash,
    createdAt: new Date(),
  });
}
