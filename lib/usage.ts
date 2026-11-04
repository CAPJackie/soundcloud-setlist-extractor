import { getDb } from "./db";
import { getUserPlan, UserPlan } from "./users";
import { isAdmin } from "./roles";

export const FREE_MONTHLY_LIMIT = Number(process.env.FREE_MONTHLY_LIMIT ?? 5);
export const PRO_MONTHLY_LIMIT = Number(process.env.PRO_MONTHLY_LIMIT ?? 100);

export function planLimit(plan: UserPlan): number {
  return plan === "pro" ? PRO_MONTHLY_LIMIT : FREE_MONTHLY_LIMIT;
}

/** Current UTC period key, e.g. "2026-07". */
export function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface UsageDoc {
  _id: string; // `${email}:${period}`
  email: string;
  period: string;
  extractions: number;
}

async function collection() {
  const db = await getDb();
  return db.collection<UsageDoc>("usage");
}

export async function getMonthlyUsage(email: string, period = currentPeriod()): Promise<number> {
  const col = await collection();
  const doc = await col.findOne({ _id: `${email.toLowerCase().trim()}:${period}` });
  return doc?.extractions ?? 0;
}

/** Increment a user's extraction count for the current period. Call ONLY on a real (uncached) extraction. */
export async function incrementMonthlyUsage(email: string, period = currentPeriod()): Promise<void> {
  const e = email.toLowerCase().trim();
  const col = await collection();
  await col.updateOne(
    { _id: `${e}:${period}` },
    { $inc: { extractions: 1 }, $setOnInsert: { email: e, period } },
    { upsert: true }
  );
}

export interface Quota {
  plan: UserPlan;
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
  /** Admins get Pro with no monthly cap; the UI hides quota messaging for them. */
  admin: boolean;
}

/** Look up a user's plan + current-period usage and whether they may run another extraction. */
export async function getQuota(email: string): Promise<Quota> {
  if (isAdmin(email)) {
    const used = await getMonthlyUsage(email);
    return { plan: "pro", used, limit: PRO_MONTHLY_LIMIT, remaining: PRO_MONTHLY_LIMIT, allowed: true, admin: true };
  }
  const [plan, used] = await Promise.all([getUserPlan(email), getMonthlyUsage(email)]);
  const limit = planLimit(plan);
  const remaining = Math.max(0, limit - used);
  return { plan, used, limit, remaining, allowed: used < limit, admin: false };
}
