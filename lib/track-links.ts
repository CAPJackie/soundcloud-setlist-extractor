/**
 * Links to a track on Spotify and Apple Music.
 *
 * - Apple Music: iTunes Search API (public, no key; ~20 requests/min per IP).
 * - Spotify: Web API search with the app's client-credentials token. Needs
 *   SPOTIFY_CLIENT_SECRET; without it only search links are given.
 * A result only counts as "direct" when its artist and title match ours: underground
 * tracks are often missing, and the first search hit is then an unrelated song.
 * Otherwise the link opens a search on the platform. Results are cached in MongoDB.
 */
import { getDb } from "./db";
import { normalizeTitle } from "./sampling-plan";
import { artistKeys } from "./corroboration";

export interface PlatformLink {
  url: string;
  /** true = the song itself; false = a search on the platform. */
  direct: boolean;
}

export interface TrackLinks {
  spotify: PlatformLink;
  apple: PlatformLink;
}

export function spotifySearchUrl(artist: string, title: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`)}`;
}

export function appleSearchUrl(artist: string, title: string): string {
  return `https://music.apple.com/search?term=${encodeURIComponent(`${artist} ${title}`)}`;
}

const VERSION_TAG = /\b(remix|rework|edit|dub|mix|version|vip|bootleg)\b/;

// Stores disagree on apostrophes ("Loop's" vs "Loops"), so they're dropped before comparing.
const noApostrophes = (s: string) => s.replace(/['’`´]/g, "");

/** Does a platform result (candidate) correspond to our track? */
export function isSameTrack(
  ours: { artist: string; title: string },
  candidate: { artist: string; title: string },
): boolean {
  const ourTitle = normalizeTitle(noApostrophes(ours.title));
  const theirTitle = normalizeTitle(noApostrophes(candidate.title));
  if (!ourTitle || !theirTitle) return false;
  // Their title may carry extra tags ("Track (Original Mix)" is already stripped).
  // Ours may only be longer if the extra part isn't a version ("Track (X Remix)" ≠ "Track").
  const titleOk =
    theirTitle.includes(ourTitle) ||
    (ourTitle.includes(theirTitle) && !VERSION_TAG.test(ourTitle.replace(theirTitle, "")));
  if (!titleOk) return false;

  const ourArtists = artistKeys(noApostrophes(ours.artist));
  const theirArtist = normalizeTitle(noApostrophes(candidate.artist));
  const theirArtists = new Set(artistKeys(noApostrophes(candidate.artist)));
  return ourArtists.some((a) => theirArtists.has(a) || ` ${theirArtist} `.includes(` ${a} `));
}

// ---------- Apple Music (iTunes Search) ----------

export class LookupRateLimited extends Error {}

async function findOnApple(artist: string, title: string): Promise<string | null> {
  const term = encodeURIComponent(`${artist} ${title}`);
  const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=10`);
  if (res.status === 403 || res.status === 429) throw new LookupRateLimited("itunes");
  if (!res.ok) throw new Error(`itunes ${res.status}`);
  const data = (await res.json()) as {
    results?: { artistName?: string; trackName?: string; trackViewUrl?: string }[];
  };
  const hit = (data.results ?? []).find(
    (r) =>
      r.trackViewUrl &&
      isSameTrack({ artist, title }, { artist: r.artistName ?? "", title: r.trackName ?? "" }),
  );
  return hit?.trackViewUrl
    ? hit.trackViewUrl.replace(/([?&])uo=\d+&?/, "$1").replace(/[?&]$/, "")
    : null;
}

// ---------- Spotify (client credentials) ----------

let spotifyToken: { value: string; expires: number } | null = null;

export function spotifyLookupEnabled(): boolean {
  return !!process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID && !!process.env.SPOTIFY_CLIENT_SECRET;
}

async function getSpotifyAppToken(): Promise<string> {
  if (spotifyToken && spotifyToken.expires > Date.now() + 60_000) return spotifyToken.value;
  const basic = Buffer.from(
    `${process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`spotify token ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  spotifyToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return spotifyToken.value;
}

async function findOnSpotify(artist: string, title: string): Promise<string | null> {
  const token = await getSpotifyAppToken();
  const q = encodeURIComponent(`track:${title} artist:${artist}`);
  const res = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) throw new LookupRateLimited("spotify");
  if (!res.ok) throw new Error(`spotify search ${res.status}`);
  const data = (await res.json()) as {
    tracks?: {
      items?: { name: string; artists: { name: string }[]; external_urls?: { spotify?: string } }[];
    };
  };
  const hit = (data.tracks?.items ?? []).find(
    (t) =>
      t.external_urls?.spotify &&
      isSameTrack(
        { artist, title },
        { artist: t.artists.map((a) => a.name).join(", "), title: t.name },
      ),
  );
  return hit?.external_urls?.spotify ?? null;
}

// ---------- Cache + batch resolve ----------

interface CachedLinks {
  _id: string;
  /** Direct URL, null = looked up and not found, undefined = never looked up. */
  spotify?: string | null;
  spotifyCheckedAt?: Date;
  apple?: string | null;
  appleCheckedAt?: Date;
}

// "Not found" is retried after this long: new releases reach the stores over time.
const NOT_FOUND_RETRY_MS = 14 * 24 * 3600 * 1000;

const cacheKey = (artist: string, title: string) =>
  `${normalizeTitle(artist)}|${normalizeTitle(title)}`;

function needsLookup(found: string | null | undefined, checkedAt: Date | undefined): boolean {
  if (found) return false;
  if (found === undefined || !checkedAt) return true;
  return Date.now() - checkedAt.getTime() > NOT_FOUND_RETRY_MS;
}

export async function resolveTrackLinks(
  tracks: { artist: string; title: string }[],
): Promise<TrackLinks[]> {
  const db = await getDb();
  const col = db.collection<CachedLinks>("track_links");
  const keys = tracks.map((t) => cacheKey(t.artist, t.title));
  const cached = new Map((await col.find({ _id: { $in: keys } }).toArray()).map((d) => [d._id, d]));

  const spotifyOn = spotifyLookupEnabled();
  let appleBlocked = false;
  let spotifyBlocked = false;

  const results: TrackLinks[] = [];
  // Sequential on purpose: iTunes allows ~20 requests/min and a set has a few dozen tracks at most.
  for (let i = 0; i < tracks.length; i++) {
    const { artist, title } = tracks[i];
    const doc: CachedLinks = { ...(cached.get(keys[i]) ?? { _id: keys[i] }) };
    const update: Partial<CachedLinks> = {};

    if (!appleBlocked && needsLookup(doc.apple, doc.appleCheckedAt)) {
      try {
        doc.apple = await findOnApple(artist, title);
        Object.assign(update, { apple: doc.apple, appleCheckedAt: new Date() });
      } catch (err) {
        if (err instanceof LookupRateLimited) appleBlocked = true;
        console.warn(`[links] apple lookup failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (spotifyOn && !spotifyBlocked && needsLookup(doc.spotify, doc.spotifyCheckedAt)) {
      try {
        doc.spotify = await findOnSpotify(artist, title);
        Object.assign(update, { spotify: doc.spotify, spotifyCheckedAt: new Date() });
      } catch (err) {
        if (err instanceof LookupRateLimited) spotifyBlocked = true;
        console.warn(`[links] spotify lookup failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (Object.keys(update).length > 0) {
      await col.updateOne({ _id: keys[i] }, { $set: update }, { upsert: true }).catch(() => {});
    }

    results.push({
      spotify: doc.spotify
        ? { url: doc.spotify, direct: true }
        : { url: spotifySearchUrl(artist, title), direct: false },
      apple: doc.apple
        ? { url: doc.apple, direct: true }
        : { url: appleSearchUrl(artist, title), direct: false },
    });
  }
  return results;
}
