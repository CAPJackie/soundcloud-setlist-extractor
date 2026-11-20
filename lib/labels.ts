/**
 * Record labels per track, for Explore's label recommendations.
 *
 * Sources, best first:
 *  1. ACRCloud's `label` on the match (stored on the track at extraction time).
 *  2. Discogs database search: the reference for techno labels. Needs DISCOGS_TOKEN.
 *  3. MusicBrainz: free, no key, but knows few underground releases.
 * Lookups are slow (MusicBrainz allows 1 request/second), so they run in the background
 * (`after()`) and results are cached in MongoDB `track_meta`.
 *
 * Also: labels per *artist* (Discogs releases), cached in `artist_labels`. Explore uses
 * these to suggest labels that release several of the user's / recommended artists,
 * which works without any other user's sets.
 */
import { getDb } from "./db";
import { normalizeTitle } from "./sampling-plan";
import { isSameTrack } from "./track-links";
import { artistKeys } from "./corroboration";

interface TrackMeta {
  _id: string;
  /** null = looked up, nothing found. */
  label: string | null;
  source: "acr" | "discogs" | "musicbrainz" | "none";
  checkedAt: Date;
}

const NOT_FOUND_RETRY_MS = 30 * 24 * 3600 * 1000;
const UA = "SetlistExtractor/1.0 (+https://github.com/)";

export const metaKey = (artist: string, title: string) =>
  `${normalizeTitle(artist)}|${normalizeTitle(title)}`;

async function collection() {
  const db = await getDb();
  return db.collection<TrackMeta>("track_meta");
}

/** Known labels for these tracks (track.label first, then the cache). Key = metaKey. */
export async function getLabels(
  tracks: { artist: string; title: string; label?: string }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const missing: string[] = [];
  for (const t of tracks) {
    const key = metaKey(t.artist, t.title);
    if (t.label) out.set(key, t.label);
    else missing.push(key);
  }
  if (missing.length > 0) {
    const col = await collection();
    for (const doc of await col
      .find({ _id: { $in: [...new Set(missing)] }, label: { $ne: null } })
      .toArray()) {
      if (doc.label) out.set(doc._id, doc.label);
    }
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const discogsEnabled = () => !!process.env.DISCOGS_TOKEN;

/** Rate limit hit even after waiting: the caller should stop for now. */
class RateLimited extends Error {}

/**
 * Discogs GET with its rate limit respected (60 requests/minute with a token): slows down
 * when few requests are left, waits and retries on 429.
 */
async function discogsGet<T>(path: string, params: URLSearchParams): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.discogs.com${path}?${params}`, {
      headers: { Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`, "User-Agent": UA },
    });
    if (res.status === 429) {
      await sleep(10_000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`discogs ${res.status}`);
    const remaining = Number(res.headers.get("x-discogs-ratelimit-remaining") ?? 60);
    if (remaining <= 3) await sleep(15_000);
    else await sleep(1000);
    return (await res.json()) as T;
  }
  throw new RateLimited("discogs");
}

async function fromDiscogs(artist: string, title: string): Promise<string | null> {
  if (!discogsEnabled()) return null;
  const params = new URLSearchParams({ artist, track: title, type: "release", per_page: "5" });
  const data = await discogsGet<{ results?: { title?: string; label?: string[] }[] }>(
    "/database/search",
    params,
  );
  // Release titles are "Artist - Release"; check the artist to avoid unrelated hits.
  const ours = normalizeTitle(artist);
  const hit = (data.results ?? []).find(
    (r) => r.label?.length && normalizeTitle(r.title ?? "").includes(ours),
  );
  return hit?.label?.[0]?.replace(/\s*\(\d+\)$/, "") ?? null; // Discogs disambiguates as "Label (2)"
}

/** MusicBrainz answers 503 when over 1 request/second: wait and retry instead of giving up. */
async function mbGet(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.status !== 503 && res.status !== 429) return res;
    await sleep(3000 * (attempt + 1));
  }
  throw new RateLimited("musicbrainz");
}

async function fromMusicBrainz(artist: string, title: string): Promise<string | null> {
  const q = encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`);
  const res = await mbGet(`https://musicbrainz.org/ws/2/recording?query=${q}&limit=5&fmt=json`);
  if (!res.ok) throw new Error(`musicbrainz ${res.status}`);
  const data = (await res.json()) as {
    recordings?: {
      title: string;
      "artist-credit"?: { name: string }[];
      releases?: { id: string }[];
    }[];
  };
  const rec = (data.recordings ?? []).find(
    (r) =>
      r.releases?.length &&
      isSameTrack(
        { artist, title },
        { artist: (r["artist-credit"] ?? []).map((c) => c.name).join(", "), title: r.title },
      ),
  );
  if (!rec?.releases?.[0]) return null;
  await sleep(1100); // MusicBrainz: max 1 request/second
  const rel = await mbGet(
    `https://musicbrainz.org/ws/2/release/${rec.releases[0].id}?inc=labels&fmt=json`,
  );
  if (!rel.ok) throw new Error(`musicbrainz ${rel.status}`);
  const r = (await rel.json()) as { "label-info"?: { label?: { name?: string } }[] };
  const name = r["label-info"]
    ?.map((l) => l.label?.name)
    .find((n) => n && !/^\[no label\]$/i.test(n));
  return name ?? null;
}

/**
 * Stores labels ACRCloud gave, then looks up the rest until `budgetMs` runs out.
 * Safe to call repeatedly: tracks already checked (recently) are skipped.
 */
export async function enrichLabels(
  tracks: { artist: string; title: string; label?: string }[],
  budgetMs: number,
): Promise<void> {
  const started = Date.now();
  const col = await collection();

  const unique = new Map<string, { artist: string; title: string; label?: string }>();
  for (const t of tracks) if (t.artist && t.title) unique.set(metaKey(t.artist, t.title), t);
  const keys = [...unique.keys()];
  const known = new Map((await col.find({ _id: { $in: keys } }).toArray()).map((d) => [d._id, d]));

  for (const [key, t] of unique) {
    if (t.label && known.get(key)?.label !== t.label) {
      await col.updateOne(
        { _id: key },
        { $set: { label: t.label, source: "acr", checkedAt: new Date() } },
        { upsert: true },
      );
    }
  }

  let looked = 0;
  let found = 0;
  let failures = 0;
  for (const [key, t] of unique) {
    if (Date.now() - started > budgetMs) break;
    if (t.label) continue;
    const doc = known.get(key);
    if (doc && (doc.label || Date.now() - doc.checkedAt.getTime() < NOT_FOUND_RETRY_MS)) continue;

    let label: string | null = null;
    let source: TrackMeta["source"] = "none";
    try {
      label = await fromDiscogs(t.artist, t.title);
      if (label) source = "discogs";
      else {
        label = await fromMusicBrainz(t.artist, t.title);
        if (label) source = "musicbrainz";
        await sleep(1100);
      }
      failures = 0;
    } catch (err) {
      // Still rate limited after waiting, or repeated errors (outage): stop now, the next
      // call continues where this one left off. A single odd error only skips the track.
      console.warn(
        `[labels] lookup failed for ${t.artist} - ${t.title}: ${err instanceof Error ? err.message : err}`,
      );
      if (err instanceof RateLimited || ++failures >= 3) break;
      continue;
    }
    looked++;
    if (label) found++;
    await col.updateOne(
      { _id: key },
      { $set: { label, source, checkedAt: new Date() } },
      { upsert: true },
    );
  }
  if (looked > 0) console.log(`[labels] looked up ${looked} tracks, found ${found} labels`);
}

// ---------- Labels per artist (Discogs) ----------

export interface ArtistLabel {
  name: string;
  /** Distinct releases of the artist on this label. */
  releases: number;
}

interface ArtistLabelsDoc {
  _id: string; // artist key
  artist: string;
  labels: ArtistLabel[];
  checkedAt: Date;
}

const ARTIST_REFRESH_MS = 60 * 24 * 3600 * 1000;
const ARTIST_NOT_FOUND_RETRY_MS = 30 * 24 * 3600 * 1000;
/** Not real labels: say nothing about the music. */
const NOT_A_LABEL = /^(not on label|self[- ]?released|none|unknown|white label|no label)\b/i;

const artistKey = (artist: string) => artistKeys(artist)[0] ?? "";

async function artistCollection() {
  const db = await getDb();
  return db.collection<ArtistLabelsDoc>("artist_labels");
}

/**
 * Labels an artist releases on, from a Discogs release search. Only the first label of a
 * release counts (later ones are often distributors or pressing plants), a release in
 * several formats counts once, and results by another artist with a similar name are dropped.
 */
async function fetchArtistLabels(artist: string): Promise<ArtistLabel[]> {
  const params = new URLSearchParams({ artist, type: "release", per_page: "100" });
  const data = await discogsGet<{ results?: { title?: string; label?: string[] }[] }>(
    "/database/search",
    params,
  );
  const ours = artistKey(artist);
  const perLabel = new Map<string, { name: string; titles: Set<string> }>();
  for (const r of data.results ?? []) {
    const [credit, ...rest] = (r.title ?? "").split(" - ");
    const credited = credit.replace(/\s*\(\d+\)/g, "").replace(/\*/g, "");
    // Compilations ("Various - …") are fine: the artist is on them.
    if (!/^various$/i.test(credited.trim()) && !artistKeys(credited).includes(ours)) continue;
    const name = r.label?.[0]?.replace(/\s*\(\d+\)$/, "").trim();
    if (!name || NOT_A_LABEL.test(name)) continue;
    const key = normalizeTitle(name);
    const entry = perLabel.get(key) ?? { name, titles: new Set() };
    entry.titles.add(normalizeTitle(rest.join(" - ")));
    perLabel.set(key, entry);
  }
  return [...perLabel.values()]
    .map((l) => ({ name: l.name, releases: l.titles.size }))
    .sort((a, b) => b.releases - a.releases);
}

/** Cached labels for these artists. Key = artist display name as given. */
export async function getArtistLabels(artists: string[]): Promise<Map<string, ArtistLabel[]>> {
  const col = await artistCollection();
  const keys = artists.map(artistKey);
  const docs = new Map(
    (await col.find({ _id: { $in: keys.filter(Boolean) } }).toArray()).map((d) => [d._id, d]),
  );
  const out = new Map<string, ArtistLabel[]>();
  artists.forEach((a, i) => {
    const d = docs.get(keys[i]);
    if (d && d.labels.length > 0) out.set(a, d.labels);
  });
  return out;
}

/**
 * Looks up artists (in the given order, most important first) not cached yet, until
 * `budgetMs` runs out. Safe to call repeatedly.
 */
export async function enrichArtistLabels(artists: string[], budgetMs: number): Promise<number> {
  if (!discogsEnabled()) return 0;
  const started = Date.now();
  const col = await artistCollection();
  const unique = new Map<string, string>();
  for (const a of artists) {
    const k = artistKey(a);
    if (k && !unique.has(k)) unique.set(k, a);
  }
  const known = new Map(
    (await col.find({ _id: { $in: [...unique.keys()] } }).toArray()).map((d) => [d._id, d]),
  );
  let looked = 0;
  let failures = 0;
  for (const [key, artist] of unique) {
    if (Date.now() - started > budgetMs) break;
    const doc = known.get(key);
    const age = doc ? Date.now() - doc.checkedAt.getTime() : Infinity;
    if (doc && age < (doc.labels.length > 0 ? ARTIST_REFRESH_MS : ARTIST_NOT_FOUND_RETRY_MS))
      continue;
    try {
      const labels = await fetchArtistLabels(artist);
      await col.updateOne(
        { _id: key },
        { $set: { artist, labels, checkedAt: new Date() } },
        { upsert: true },
      );
      looked++;
      failures = 0;
    } catch (err) {
      console.warn(
        `[labels] artist lookup failed for ${artist}: ${err instanceof Error ? err.message : err}`,
      );
      if (err instanceof RateLimited || ++failures >= 3) break;
    }
  }
  if (looked > 0) console.log(`[labels] looked up labels of ${looked} artists`);
  return looked;
}
