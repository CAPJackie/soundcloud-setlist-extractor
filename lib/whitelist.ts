export function isEmailWhitelisted(email: string): boolean {
  const list = (process.env.EMAIL_WHITELIST ?? "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
  return list.includes(email.toLowerCase().trim());
}
