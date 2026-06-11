import { NextRequest, NextResponse } from "next/server";

// Ephemeral in-memory relay for the Spotify OAuth popup → opener handoff.
// Modern browsers partition localStorage / BroadcastChannel / window.opener
// when a popup passes through a third-party origin, so we route the token
// through the server instead. Entries auto-expire after 2 minutes.

type Entry = { token?: string; error?: string; expires: number };
const store: Map<string, Entry> = (globalThis as { __spotifyTokenStore?: Map<string, Entry> }).__spotifyTokenStore ?? new Map();
(globalThis as { __spotifyTokenStore?: Map<string, Entry> }).__spotifyTokenStore = store;

function sweep() {
  const now = Date.now();
  for (const [k, v] of store) if (v.expires < now) store.delete(k);
}

export async function POST(req: NextRequest) {
  sweep();
  const body = await req.json().catch(() => null);
  const key = body?.key as string | undefined;
  if (!key || typeof key !== "string" || key.length < 16) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  store.set(key, {
    token: typeof body?.token === "string" ? body.token : undefined,
    error: typeof body?.error === "string" ? body.error : undefined,
    expires: Date.now() + 2 * 60 * 1000,
  });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  sweep();
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({}, { status: 400 });
  const entry = store.get(key);
  if (!entry) return NextResponse.json({ pending: true });
  store.delete(key);
  return NextResponse.json({ token: entry.token, error: entry.error });
}
