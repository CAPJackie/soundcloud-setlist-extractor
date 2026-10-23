/**
 * Admin emails are seeded via the ADMIN_EMAILS env var (comma-separated) so admins
 * can be granted without a DB write. The `role` field on the user document remains
 * available for future DB-driven roles.
 *
 * This module is intentionally dependency-free (no `auth` import) so it can be used
 * inside the NextAuth config without a circular import. The auth-aware `requireAdmin`
 * helper lives in `lib/require-admin.ts`.
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
  return list.includes(email.toLowerCase().trim());
}
