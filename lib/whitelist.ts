function whitelist(): string[] {
  return (process.env.EMAIL_WHITELIST ?? "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
}

export function isEmailWhitelisted(email: string): boolean {
  return whitelist().includes(email.toLowerCase().trim());
}

/**
 * Registration is OPEN by default (public launch). If EMAIL_WHITELIST is set,
 * registration is restricted to those emails (useful for a closed beta).
 */
export function isRegistrationAllowed(email: string): boolean {
  const list = whitelist();
  if (list.length === 0) return true;
  return list.includes(email.toLowerCase().trim());
}
