import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createCheckoutSession } from "@/lib/stripe";
import { getQuota } from "@/lib/usage";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Avoid a second subscription for users who already have Pro (or admin access).
  const quota = await getQuota(session.user.email).catch(() => null);
  if (quota?.admin || quota?.plan === "pro") {
    return NextResponse.json({ error: "You already have Pro access." }, { status: 409 });
  }
  try {
    const url = await createCheckoutSession(session.user.email);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[billing] checkout error", err);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
