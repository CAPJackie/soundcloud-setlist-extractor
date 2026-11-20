export interface SoundCloudTrack {
  id: number | null;
  title: string;
  description: string;
  duration: number; // ms
  transcodings: Transcoding[];
  artworkUrl: string | null;
  username: string;
  /** Uploader's account id and URL slug: used to spot the artist's own replies in comments. */
  userId: number | null;
  userPermalink: string;
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
  console.log(`[soundcloud] fetched track page: ${url}`);
  const html = await res.text();
  const track = parseSoundCloudTrack(html);
  console.log(`[soundcloud] track: "${track.title}" by ${track.username}`);
  return track;
}

/** Track data from a SoundCloud track page's HTML (window.__sc_hydration). */
export function parseSoundCloudTrack(html: string): SoundCloudTrack {
  const hydration = extractHydration(html);
  const soundEntry = hydration.find((e) => e.hydratable === "sound");
  if (!soundEntry) throw new Error("Could not find track data in SoundCloud page");

  const d = soundEntry.data as Record<string, unknown>;
  const media = d.media as { transcodings: Transcoding[] } | undefined;

  const createdAt = d.created_at ? new Date(String(d.created_at)) : null;

  const track = {
    id: typeof d.id === "number" ? d.id : null,
    title: String(d.title ?? ""),
    description: String(d.description ?? ""),
    duration: Number(d.duration ?? 0),
    transcodings: media?.transcodings ?? [],
    artworkUrl: d.artwork_url ? String(d.artwork_url) : null,
    username: String((d.user as Record<string, unknown>)?.username ?? ""),
    userId:
      typeof (d.user as Record<string, unknown>)?.id === "number"
        ? ((d.user as Record<string, unknown>).id as number)
        : null,
    userPermalink: String((d.user as Record<string, unknown>)?.permalink ?? ""),
    publishedAt: createdAt instanceof Date && !isNaN(createdAt.getTime()) ? createdAt : null,
  };
  return track;
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

  console.log(`[soundcloud] extracting client_id (${scriptUrls.length} bundles)`);

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
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      console.log(`[soundcloud] client_id found`);
      return r.value;
    }
  }

  console.warn(`[soundcloud] client_id not found`);
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
  clientId: string,
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
    const streamUrl = json.url ?? null;
    if (streamUrl) console.log(`[soundcloud] stream URL resolved`);
    else console.warn(`[soundcloud] stream URL missing in response`);
    return streamUrl;
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

export interface SoundCloudComment {
  body: string;
  /** Position in the track the comment is pinned to. */
  timestampMs: number | null;
  username: string;
  userId: number | null;
  userPermalink: string;
}

/** All comments of a track (paginated api-v2 endpoint), capped at `max`. Never throws. */
export async function fetchSoundCloudComments(
  trackId: number,
  clientId: string,
  max = 3000,
): Promise<SoundCloudComment[]> {
  const out: SoundCloudComment[] = [];
  let next: string | null =
    `https://api-v2.soundcloud.com/tracks/${trackId}/comments?threaded=0&filter_replies=0&limit=200&offset=0`;
  try {
    while (next && out.length < max) {
      const pageUrl: string = next.includes("client_id=")
        ? next
        : `${next}${next.includes("?") ? "&" : "?"}client_id=${clientId}`;
      const res = await fetch(pageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) {
        console.warn(`[soundcloud] comments fetch failed: ${res.status}`);
        break;
      }
      const page = (await res.json()) as {
        collection?: {
          body?: string;
          timestamp?: number | null;
          user_id?: number;
          user?: { id?: number; username?: string; permalink?: string };
        }[];
        next_href?: string | null;
      };
      for (const c of page.collection ?? []) {
        out.push({
          body: String(c.body ?? ""),
          timestampMs: typeof c.timestamp === "number" ? c.timestamp : null,
          username: String(c.user?.username ?? ""),
          userId:
            typeof c.user?.id === "number"
              ? c.user.id
              : typeof c.user_id === "number"
                ? c.user_id
                : null,
          userPermalink: String(c.user?.permalink ?? ""),
        });
      }
      next = page.next_href ?? null;
    }
  } catch (err) {
    console.warn(`[soundcloud] comments fetch error: ${err instanceof Error ? err.message : err}`);
  }
  console.log(`[soundcloud] fetched ${out.length} comments`);
  return out;
}

export interface SoundCloudRelated {
  id: number;
  url: string;
  title: string;
  username: string;
  durationSecs: number;
  artworkUrl: string | null;
}

/** SoundCloud's "related tracks" for a track (mixes sets and single tracks). Never throws. */
export async function fetchRelatedTracks(
  trackId: number,
  clientId: string,
  limit = 30,
): Promise<SoundCloudRelated[]> {
  try {
    const res = await fetch(
      `https://api-v2.soundcloud.com/tracks/${trackId}/related?limit=${limit}&client_id=${clientId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      },
    );
    if (!res.ok) {
      console.warn(`[soundcloud] related fetch failed: ${res.status}`);
      return [];
    }
    const data = (await res.json()) as {
      collection?: {
        id: number;
        permalink_url?: string;
        title?: string;
        duration?: number;
        artwork_url?: string | null;
        user?: { username?: string; avatar_url?: string };
      }[];
    };
    return (data.collection ?? [])
      .filter((t) => t.permalink_url)
      .map((t) => ({
        id: t.id,
        url: t.permalink_url!,
        title: String(t.title ?? ""),
        username: String(t.user?.username ?? ""),
        durationSecs: Math.round((t.duration ?? 0) / 1000),
        artworkUrl: t.artwork_url ?? t.user?.avatar_url ?? null,
      }));
  } catch (err) {
    console.warn(`[soundcloud] related fetch error: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}
