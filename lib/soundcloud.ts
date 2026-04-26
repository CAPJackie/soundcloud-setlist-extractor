export interface SoundCloudTrack {
  title: string;
  description: string;
  duration: number; // ms
  transcodings: Transcoding[];
  artworkUrl: string | null;
  username: string;
  publishedAt: Date | null;
}

interface Transcoding {
  url: string;
  preset: string;
  format: { protocol: string; mime_type: string };
}

interface HydrationEntry {
  hydratable: string;
  data: Record<string, unknown>;
}

export async function fetchSoundCloudTrack(url: string): Promise<SoundCloudTrack> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) throw new Error(`SoundCloud fetch failed: ${res.status}`);
  const html = await res.text();

  const hydration = extractHydration(html);
  const soundEntry = hydration.find((e) => e.hydratable === "sound");
  if (!soundEntry) throw new Error("Could not find track data in SoundCloud page");

  const d = soundEntry.data as Record<string, unknown>;
  const media = d.media as { transcodings: Transcoding[] } | undefined;

  const createdAt = d.created_at ? new Date(String(d.created_at)) : null;

  return {
    title: String(d.title ?? ""),
    description: String(d.description ?? ""),
    duration: Number(d.duration ?? 0),
    transcodings: media?.transcodings ?? [],
    artworkUrl: d.artwork_url ? String(d.artwork_url) : null,
    username: String((d.user as Record<string, unknown>)?.username ?? ""),
    publishedAt: createdAt instanceof Date && !isNaN(createdAt.getTime()) ? createdAt : null,
  };
}

function extractHydration(html: string): HydrationEntry[] {
  const match = html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
  if (!match) return [];
  try {
    return JSON.parse(match[1]) as HydrationEntry[];
  } catch {
    return [];
  }
}

export async function extractClientId(html: string): Promise<string | null> {
  // Try directly in the HTML first
  const directMatch = html.match(/client_id[=:]["']?([a-zA-Z0-9]{20,})["']?/);
  if (directMatch) return directMatch[1];

  // client_id lives inside one of the JS bundles — fetch all in parallel, return first hit
  const scriptUrls = [
    ...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js[^"]*)"/g),
  ].map((m) => m[1]);

  const results = await Promise.allSettled(
    scriptUrls.map(async (url) => {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) throw new Error("not ok");
      const js = await res.text();
      const match = js.match(/client_id[=:]["']([a-zA-Z0-9]{20,})["']/);
      if (!match) throw new Error("not found");
      return match[1];
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") return r.value;
  }

  return null;
}

export async function fetchSoundCloudPageHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`SoundCloud fetch failed: ${res.status}`);
  return res.text();
}

export async function resolveStreamUrl(
  transcodingUrl: string,
  clientId: string
): Promise<string | null> {
  try {
    const res = await fetch(`${transcodingUrl}?client_id=${clientId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { url?: string };
    return json.url ?? null;
  } catch {
    return null;
  }
}

export function getHlsTranscodings(transcodings: Transcoding[]): Transcoding[] {
  // Prefer audio/mpeg (mp3 segments) over audio/mpegurl and audio/mp4
  const order = ["audio/mpeg", "audio/mp4", "audio/mpegurl"];
  return transcodings
    .filter((t) => t.format.protocol === "hls")
    .sort((a, b) => {
      const ai = order.findIndex((o) => a.format.mime_type.startsWith(o));
      const bi = order.findIndex((o) => b.format.mime_type.startsWith(o));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
}
