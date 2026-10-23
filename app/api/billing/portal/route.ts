import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createPortalSession } from "@/lib/stripe";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const url = await createPortalSession(session.user.email);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[billing] portal error", err);
    return NextResponse.json({ error: "Could not open billing portal" }, { status: 500 });
  }
}
