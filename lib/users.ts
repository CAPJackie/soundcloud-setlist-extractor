import { getDb } from "./db";

export type UserRole = "user" | "admin";
export type UserPlan = "free" | "pro";

export interface User {
  email: string;
  passwordHash?: string;
  createdAt: Date;
  role?: UserRole;
  plan?: UserPlan;
  stripeCustomerId?: string;
  subscriptionStatus?: string; // active | canceled | past_due | ...
}

async function collection() {
  const db = await getDb();
  const col = db.collection<User>("users");
  await col.createIndex({ email: 1 }, { unique: true });
  await col.createIndex({ stripeCustomerId: 1 }, { sparse: true });
  return col;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const col = await collection();
  return col.findOne({ email: email.toLowerCase().trim() }, { projection: { _id: 0 } });
}

export async function findUserByStripeCustomerId(customerId: string): Promise<User | null> {
  const col = await collection();
  return col.findOne({ stripeCustomerId: customerId }, { projection: { _id: 0 } });
}

/** Effective plan for a user, defaulting to "free" for missing/unknown users. */
export async function getUserPlan(email: string): Promise<UserPlan> {
  const user = await findUserByEmail(email);
  return user?.plan ?? "free";
}

export async function setStripeCustomerId(email: string, stripeCustomerId: string): Promise<void> {
  const col = await collection();
  await col.updateOne(
    { email: email.toLowerCase().trim() },
    { $set: { stripeCustomerId } }
  );
}

/** Set the billing plan + subscription status. Keyed by email (preferred) or stripe customer id. */
export async function setUserPlan(
  by: { email?: string; stripeCustomerId?: string },
  plan: UserPlan,
  subscriptionStatus?: string
): Promise<void> {
  const col = await collection();
  const filter = by.email
    ? { email: by.email.toLowerCase().trim() }
    : { stripeCustomerId: by.stripeCustomerId };
  await col.updateOne(filter, {
    $set: { plan, ...(subscriptionStatus ? { subscriptionStatus } : {}) },
  });
}

export async function createUser(email: string, passwordHash: string): Promise<void> {
  const col = await collection();
  await col.insertOne({
    email: email.toLowerCase().trim(),
    passwordHash,
    createdAt: new Date(),
  });
}

export async function updateUserPassword(email: string, passwordHash: string): Promise<void> {
  const col = await collection();
  await col.updateOne(
    { email: email.toLowerCase().trim() },
    { $set: { passwordHash } }
  );
}

export async function upsertGoogleUser(email: string): Promise<void> {
  const col = await collection();
  await col.updateOne(
    { email: email.toLowerCase().trim() },
    { $setOnInsert: { email: email.toLowerCase().trim(), createdAt: new Date() } },
    { upsert: true }
  );
}
