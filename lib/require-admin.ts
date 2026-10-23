import { auth } from "@/auth";
import { isAdmin } from "./roles";

/**
 * Returns the session iff the caller is authenticated AND an admin, else null.
 * Callers should return a 403 when this yields null.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) return null;
  return session;
}
