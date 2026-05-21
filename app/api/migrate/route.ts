import { NextResponse } from "next/server";
import { backfillSearchedBy } from "@/lib/setlist-cache";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const count = await backfillSearchedBy("c4pjackie@gmail.com");
  return NextResponse.json({ migrated: count });
}
