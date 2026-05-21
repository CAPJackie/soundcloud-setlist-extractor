import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/users";
import { createResetToken } from "@/lib/password-reset";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const normalized = email.toLowerCase().trim();
  const user = await findUserByEmail(normalized);

  // Always return success to avoid leaking which emails are registered
  if (user) {
    const token = await createResetToken(normalized);
    await sendPasswordResetEmail(normalized, token).catch((err) => {
      console.error("Failed to send reset email:", err);
    });
  }

  return NextResponse.json({ ok: true });
}
