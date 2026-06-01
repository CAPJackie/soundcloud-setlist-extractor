import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { findUserByEmail, updateUserPassword } from "@/lib/users";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { currentPassword, newPassword } = (await req.json()) as {
    currentPassword: string;
    newPassword: string;
  };

  const user = await findUserByEmail(session.user.email);
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return Response.json({ error: "Current password is incorrect" }, { status: 400 });

  if (!newPassword || newPassword.length < 8)
    return Response.json({ error: "New password must be at least 8 characters" }, { status: 400 });

  const hash = await bcrypt.hash(newPassword, 10);
  await updateUserPassword(session.user.email, hash);
  return Response.json({ ok: true });
}
