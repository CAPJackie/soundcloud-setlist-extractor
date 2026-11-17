/**
 * Data loading for /explore. Recommendation logic lives in explore-logic.ts (pure).
 * Each loader is wrapped in React `cache()` so the page's sections can call them
 * independently (each in its own <Suspense>) without repeating work in one request.
 *
 * External calls are cached in MongoDB:
 *  - `sc_related`     SoundCloud related tracks per set, 24h
 *  - `lastfm_similar` Last.fm similar artists per artist, 7 days
 *  - `artist_labels`  Discogs labels per artist (lib/labels.ts)
 */
import { cache } from "react";
import type { ObjectId } from "mongodb";
import { getDb } from "./db";
import { enrichArtistLabels, getArtistLabels, getLabels, metaKey } from "./labels";
import { extractClientId, fetchRelatedTracks, fetchSoundCloudPageHtml, parseSoundCloudTrack } from "./soundcloud";
import { artistKeys } from "./corroboration";
import {
  recommendArtists,
  recommendLabels,
  tasteProfile,
  rankRelatedSets,
  type ExploreSet,
  type LastfmSimilar,
  type NamedCount,
  type RelatedSet,
} from "./explore-logic";
import type { CachedTrack } from "./setlist-cache";

const DAY_MS = 24 * 3600 * 1000;
/** How many of the user's (most recent) sets feed SoundCloud related sets. */
const RELATED_SOURCE_SETS = 8;
/** How many of the user's top artists are sent to Last.fm. */
const LASTFM_SEED_ARTISTS = 10;

interface SetDoc {
  _id: ObjectId;
  url: string;
  title: string;
  username: string;
  tracks: CachedTrack[];
  scTrackId?: number | null;
}

function toExploreSet(d: SetDoc, labels: Map<string, string>): ExploreSet {
  return {
    id: d._id.toString(),
    url: d.url,
    title: d.title,
    username: d.username,
    tracks: (d.tracks ?? []).map((t) => ({ ...t, label: t.label ?? labels.get(metaKey(t.artist, t.title)) })),
  };
}

/** The user's sets (searched or liked) and everyone else's, with labels resolved. */
export const loadExploreBase = cache(async (email: string) => {
  const db = await getDb();
  const col = db.collection<SetDoc>("setlists");
  const projection = { url: 1, title: 1, username: 1, tracks: 1, scTrackId: 1 };
  const [mine, others] = await Promise.all([
    col.find({ $or: [{ searchedBy: email }, { likedBy: email }] }, { projection }).sort({ cachedAt: -1 }).limit(200).toArray(),
    col
      .find({ searchedBy: { $ne: email }, likedBy: { $ne: email } }, { projection })
      .sort({ cachedAt: -1 })
      .limit(1000)
      .toArray(),
  ]);
  const labels = await getLabels([...mine, ...others].flatMap((d) => d.tracks ?? []));
  const mySets = mine.map((d) => toExploreSet(d, labels));
  const otherSets = others.map((d) => toExploreSet(d, labels));
  return {
    mySets,
    otherSets,
    /** SoundCloud track ids already known per set url (saved at extraction). */
    scIds: new Map(mine.filter((d) => d.scTrackId).map((d) => [d.url, d.scTrackId as number])),
    taste: tasteProfile(mySets),
  };
});

// ---------- SoundCloud related sets ----------

let clientIdCache: { value: string; at: number } | null = null;

async function soundCloudClientId(html: string | null): Promise<string | null> {
  if (clientIdCache && Date.now() - clientIdCache.at < 6 * 3600 * 1000) return clientIdCache.value;
  const page = html ?? (await fetchSoundCloudPageHtml("https://soundcloud.com/discover").catch(() => null));
  if (!page) return null;
  const id = await extractClientId(page);
  if (id) clientIdCache = { value: id, at: Date.now() };
  return id;
}

interface RelatedDoc {
  _id: string; // set url
  related: RelatedSet[];
  fetchedAt: Date;
}

/** SoundCloud related sets for the user's most recent sets, merged and ranked. */
export const loadRelatedSets = cache(async (email: string) => {
  const { mySets, scIds } = await loadExploreBase(email);
  const db = await getDb();
  const cacheCol = db.collection<RelatedDoc>("sc_related");
  const sources = mySets.slice(0, RELATED_SOURCE_SETS);
  const cached = new Map(
    (await cacheCol.find({ _id: { $in: sources.map((s) => s.url) } }).toArray()).map((d) => [d._id, d])
  );

  const perSource = await Promise.all(
    sources.map(async (set) => {
      const hit = cached.get(set.url);
      if (hit && Date.now() - hit.fetchedAt.getTime() < DAY_MS) return { sourceUrl: set.url, related: hit.related };
      try {
        let scId = scIds.get(set.url) ?? null;
        let html: string | null = null;
        if (!scId) {
          html = await fetchSoundCloudPageHtml(set.url);
          scId = parseSoundCloudTrack(html).id;
          // Saved so the page fetch isn't needed next time.
          if (scId) await db.collection("setlists").updateOne({ url: set.url }, { $set: { scTrackId: scId } }).catch(() => {});
        }
        const clientId = await soundCloudClientId(html);
        if (!scId || !clientId) return { sourceUrl: set.url, related: hit?.related ?? [] };
        const related: RelatedSet[] = (await fetchRelatedTracks(scId, clientId)).map((r) => ({
          scId: r.id,
          url: r.url,
          title: r.title,
          username: r.username,
          durationSecs: r.durationSecs,
          artworkUrl: r.artworkUrl,
        }));
        await cacheCol.updateOne({ _id: set.url }, { $set: { related, fetchedAt: new Date() } }, { upsert: true });
        return { sourceUrl: set.url, related };
      } catch (err) {
        console.warn(`[explore] related sets failed for ${set.url}: ${err instanceof Error ? err.message : err}`);
        return { sourceUrl: set.url, related: hit?.related ?? [] };
      }
    })
  );

  const ranked = rankRelatedSets(perSource, new Set(mySets.map((s) => s.url)));
  // Which of them already have a tracklist in the database (free to open).
  const inDb = new Map(
    (
      await db
        .collection<{ _id: ObjectId; url: string; incomplete?: boolean }>("setlists")
        .find({ url: { $in: ranked.map((r) => r.url) } }, { projection: { url: 1, incomplete: 1 } })
        .toArray()
    ).map((d) => [d.url, { id: d._id.toString(), incomplete: !!d.incomplete }])
  );
  return ranked.map((r) => ({ ...r, inDb: inDb.get(r.url) ?? null }));
});

// ---------- Last.fm similar artists ----------

interface LastfmDoc {
  _id: string; // artist key
  forArtist: string;
  similar: { name: string; match: number }[];
  fetchedAt: Date;
}

export const lastfmEnabled = () => !!process.env.LASTFM_API_KEY;

async function fetchLastfmSimilar(artist: string): Promise<{ name: string; match: number }[]> {
  const params = new URLSearchParams({
    method: "artist.getsimilar",
    artist,
    api_key: process.env.LASTFM_API_KEY!,
    format: "json",
    limit: "25",
    autocorrect: "1",
  });
  const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`);
  if (!res.ok) throw new Error(`lastfm ${res.status}`);
  const data = (await res.json()) as { similarartists?: { artist?: { name: string; match: string }[] }; error?: number };
  if (data.error === 6) return []; // artist not found
  if (data.error) throw new Error(`lastfm error ${data.error}`);
  return (data.similarartists?.artist ?? []).map((a) => ({ name: a.name, match: Number(a.match) || 0 }));
}

export const loadLastfmSimilar = cache(async (email: string): Promise<LastfmSimilar[]> => {
  if (!lastfmEnabled()) return [];
  const { taste } = await loadExploreBase(email);
  const seeds = taste.artists.slice(0, LASTFM_SEED_ARTISTS);
  if (seeds.length === 0) return [];
  const db = await getDb();
  const col = db.collection<LastfmDoc>("lastfm_similar");
  const cached = new Map((await col.find({ _id: { $in: seeds.map((s) => s.key) } }).toArray()).map((d) => [d._id, d]));

  return Promise.all(
    seeds.map(async (seed: NamedCount) => {
      const hit = cached.get(seed.key);
      if (hit && Date.now() - hit.fetchedAt.getTime() < 7 * DAY_MS) return { forArtist: seed.name, similar: hit.similar };
      try {
        const similar = await fetchLastfmSimilar(seed.name);
        await col.updateOne({ _id: seed.key }, { $set: { forArtist: seed.name, similar, fetchedAt: new Date() } }, { upsert: true });
        return { forArtist: seed.name, similar };
      } catch (err) {
        console.warn(`[explore] last.fm failed for ${seed.name}: ${err instanceof Error ? err.message : err}`);
        return { forArtist: seed.name, similar: hit?.similar ?? [] };
      }
    })
  );
});

export const loadArtistRecs = cache(async (email: string) => {
  const [{ taste, otherSets }, lastfm] = await Promise.all([loadExploreBase(email), loadLastfmSimilar(email)]);
  return recommendArtists(taste.artists, otherSets, lastfm);
});

// ---------- Label recommendations ----------

/** Artists whose Discogs labels feed "Labels to explore". */
const LABEL_SEED_MINE = 15;
const LABEL_SEED_RECS = 12;
/** Discogs lookups done while the section renders (it streams, the rest of the page doesn't wait). */
const LABEL_INLINE_BUDGET_MS = 15_000;

/** Seed artists for label lookups, most important first (user's top artists, then recs). */
export const labelSeedArtists = cache(async (email: string) => {
  const [{ taste }, recs] = await Promise.all([loadExploreBase(email), loadArtistRecs(email)]);
  return [
    ...taste.artists.slice(0, LABEL_SEED_MINE).map((a) => ({ artist: a.name, mine: true })),
    ...recs.slice(0, LABEL_SEED_RECS).map((r) => ({ artist: r.name, mine: false })),
  ];
});

export const loadLabelRecs = cache(async (email: string) => {
  const [{ taste, otherSets }, recs, seeds] = await Promise.all([
    loadExploreBase(email),
    loadArtistRecs(email),
    labelSeedArtists(email),
  ]);
  await enrichArtistLabels(
    seeds.map((s) => s.artist),
    LABEL_INLINE_BUDGET_MS
  ).catch(() => 0);
  const byArtist = await getArtistLabels(seeds.map((s) => s.artist));
  const keys = new Set([...taste.artists.map((a) => a.key), ...recs.map((r) => r.key)]);
  const otherTracks = otherSets.flatMap((s) => s.tracks).filter((t) => artistKeys(t.artist).some((k) => keys.has(k)));
  return recommendLabels(
    taste.labels,
    seeds.map((s) => ({ ...s, labels: byArtist.get(s.artist) ?? [] })),
    otherTracks
  );
});
