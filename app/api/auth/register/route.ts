import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { isEmailWhitelisted } from "@/lib/whitelist";
import { findUserByEmail, createUser } from "@/lib/users";

export async function POST(req: Request) {
  const body = await req.json();
  const email = (body.email as string | undefined)?.toLowerCase().trim() ?? "";
  const password = (body.password as string | undefined) ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  if (!isEmailWhitelisted(email)) {
    return NextResponse.json({ error: "Email not authorized" }, { status: 403 });
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: "Account already exists" }, { status: 409 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await createUser(email, passwordHash);

  return NextResponse.json({ ok: true }, { status: 201 });
}
