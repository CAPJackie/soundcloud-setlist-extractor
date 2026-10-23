import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getQuota } from "@/lib/usage";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const quota = await getQuota(session.user.email);
  return NextResponse.json(quota);
}
