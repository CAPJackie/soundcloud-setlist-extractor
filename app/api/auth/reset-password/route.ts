import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { consumeResetToken } from "@/lib/password-reset";
import { updateUserPassword } from "@/lib/users";

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (!token || !password || typeof token !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Token and password required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const email = await consumeResetToken(token);
  if (!email) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await updateUserPassword(email, passwordHash);

  return NextResponse.json({ ok: true });
}
