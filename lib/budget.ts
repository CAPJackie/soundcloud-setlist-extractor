import { getDb } from "./db";

/**
 * Global daily ceiling on ACRCloud calls across ALL users — a fail-safe against a
 * runaway bill regardless of per-user limits. Kept below the 20,000/mo free tier by
 * default (~15k/day headroom); tune via ACR_DAILY_BUDGET.
 */
export const ACR_DAILY_BUDGET = Number(process.env.ACR_DAILY_BUDGET ?? 15000);

interface BudgetDoc {
  _id: string; // `acr:${yyyymmdd}`
  count: number;
}

function dayKey(date = new Date()): string {
  return `acr:${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

async function collection() {
  const db = await getDb();
  return db.collection<BudgetDoc>("budget");
}

export async function getAcrDailyCount(): Promise<number> {
  const col = await collection();
  const doc = await col.findOne({ _id: dayKey() });
  return doc?.count ?? 0;
}

export async function isAcrBudgetExceeded(): Promise<boolean> {
  return (await getAcrDailyCount()) >= ACR_DAILY_BUDGET;
}

/** Record ACR calls consumed by an extraction against today's global budget. */
export async function addAcrCalls(n: number): Promise<void> {
  if (n <= 0) return;
  const col = await collection();
  await col.updateOne({ _id: dayKey() }, { $inc: { count: n } }, { upsert: true });
}
