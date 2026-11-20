import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveTrackLinks } from "@/lib/track-links";

const MAX_TRACKS = 100;

// POST { tracks: [{artist, title}] } → { links: [{spotify: {url, direct}, apple: {url, direct}}] }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const tracks = Array.isArray(body?.tracks) ? body.tracks : null;
  if (!tracks || tracks.length === 0 || tracks.length > MAX_TRACKS) {
    return NextResponse.json({ error: `Send 1–${MAX_TRACKS} tracks` }, { status: 400 });
  }
  const clean = tracks
    .map((t: unknown) => {
      const o = t as { artist?: unknown; title?: unknown };
      return {
        artist: String(o?.artist ?? "").slice(0, 200),
        title: String(o?.title ?? "").slice(0, 200),
      };
    })
    .filter((t: { artist: string; title: string }) => t.artist && t.title);
  if (clean.length !== tracks.length)
    return NextResponse.json({ error: "Each track needs artist and title" }, { status: 400 });

  const links = await resolveTrackLinks(clean);
  return NextResponse.json({ links });
}
