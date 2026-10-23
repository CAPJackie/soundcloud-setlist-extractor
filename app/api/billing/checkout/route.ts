import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createCheckoutSession } from "@/lib/stripe";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const url = await createCheckoutSession(session.user.email);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[billing] checkout error", err);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
