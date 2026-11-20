/**
 * Explore recommendations. Pure logic over setlists, no I/O, so it can be tested.
 *
 * Signals:
 *  - Taste: artists/labels across the user's own sets (searched or liked).
 *  - Co-occurrence: artists that other sets play next to the user's artists. For
 *    underground music this beats streaming-service similarity, which barely knows
 *    these artists.
 *  - Last.fm similar artists (optional, passed in).
 *  - SoundCloud related sets (passed in, ranked here).
 * Doubtful tracks (lowConfidence) never count: a false match must not shape taste.
 */
import { artistKeys } from "./corroboration";
import { normalizeTitle } from "./sampling-plan";

export interface ExploreTrack {
  artist: string;
  title: string;
  timestamp?: string;
  lowConfidence?: boolean;
  /** Resolved label (track.label or lib/labels cache). */
  label?: string;
}

export interface ExploreSet {
  id: string;
  url: string;
  title: string;
  username: string;
  tracks: ExploreTrack[];
}

export interface NamedCount {
  key: string;
  name: string;
  /** Number of the user's sets it appears in. */
  sets: number;
  tracks: number;
}

const trusted = (tracks: ExploreTrack[]) => tracks.filter((t) => !t.lowConfidence);
export const trackKey = (t: { artist: string; title: string }) =>
  `${normalizeTitle(t.artist)}|${normalizeTitle(t.title)}`;
export const labelKey = (label: string) =>
  normalizeTitle(label.replace(/\b(records|recordings|music|ltd|limited|inc)\b/gi, ""));

/** Most common spelling wins as display name. */
class Tally {
  private items = new Map<
    string,
    { names: Map<string, number>; sets: Set<string>; tracks: number }
  >();
  add(key: string, name: string, setId: string) {
    const it = this.items.get(key) ?? { names: new Map(), sets: new Set(), tracks: 0 };
    it.names.set(name, (it.names.get(name) ?? 0) + 1);
    it.sets.add(setId);
    it.tracks++;
    this.items.set(key, it);
  }
  list(): NamedCount[] {
    return [...this.items.entries()]
      .map(([key, it]) => ({
        key,
        name: [...it.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
        sets: it.sets.size,
        tracks: it.tracks,
      }))
      .sort((a, b) => b.sets - a.sets || b.tracks - a.tracks || a.name.localeCompare(b.name));
  }
}

/** Splits "A, B" into its artists, keeping the original spelling for display. */
function splitArtists(artist: string): { key: string; name: string }[] {
  const names = artist
    .split(/\s*(?:,|&|\+|\/|;|\bfeat\.?|\bft\.?|\bfeaturing\b|\bvs\.?|\bx\b)\s*/i)
    .filter(Boolean);
  const out: { key: string; name: string }[] = [];
  for (const n of names) {
    const [key] = artistKeys(n);
    if (key) out.push({ key, name: n.trim() });
  }
  return out;
}

export function tasteProfile(mySets: ExploreSet[]): {
  artists: NamedCount[];
  labels: NamedCount[];
} {
  const artists = new Tally();
  const labels = new Tally();
  for (const set of mySets) {
    for (const t of trusted(set.tracks)) {
      for (const a of splitArtists(t.artist)) artists.add(a.key, a.name, set.id);
      if (t.label) {
        const k = labelKey(t.label);
        if (k) labels.add(k, t.label, set.id);
      }
    }
  }
  return { artists: artists.list(), labels: labels.list() };
}

export interface ArtistRec {
  key: string;
  name: string;
  score: number;
  /** User's artists that led to this one (for "because you like …"). */
  because: string[];
  sources: ("sets" | "lastfm")[];
}

export interface LastfmSimilar {
  /** One of the user's artists. */
  forArtist: string;
  similar: { name: string; match: number }[];
}

/**
 * Artists the user doesn't have yet, from two signals:
 *  - co-occurrence: other sets that play the user's artists, weighted by how many they share
 *  - Last.fm similarity, weighted by how central that artist is to the user's taste
 * Each signal is normalized to 0–1 so neither dominates just by volume.
 */
export function recommendArtists(
  taste: NamedCount[],
  otherSets: ExploreSet[],
  lastfm: LastfmSimilar[],
  limit = 24,
): ArtistRec[] {
  const mine = new Map(taste.map((a) => [a.key, a]));
  const maxSets = Math.max(1, ...taste.map((a) => a.sets));
  // One shared artist in an eclectic set (e.g. a techno act on a house/jazz set) is
  // noise: with an established taste, a set must share at least 2 artists to count.
  const minShared = taste.length >= 5 ? 2 : 1;
  const recs = new Map<
    string,
    {
      name: string;
      cooc: number;
      lfm: number;
      because: Map<string, number>;
      sources: Set<"sets" | "lastfm">;
    }
  >();
  const get = (key: string, name: string) => {
    const r = recs.get(key) ?? { name, cooc: 0, lfm: 0, because: new Map(), sources: new Set() };
    recs.set(key, r);
    return r;
  };

  for (const set of otherSets) {
    const artists = new Map<string, string>();
    for (const t of trusted(set.tracks))
      for (const a of splitArtists(t.artist)) artists.set(a.key, a.name);
    const shared = [...artists.keys()].filter((k) => mine.has(k));
    if (shared.length < minShared) continue;
    for (const [key, name] of artists) {
      if (mine.has(key)) continue;
      const r = get(key, name);
      r.cooc += shared.length;
      r.sources.add("sets");
      for (const s of shared)
        r.because.set(mine.get(s)!.name, (r.because.get(mine.get(s)!.name) ?? 0) + 1);
    }
  }

  for (const entry of lastfm) {
    const [fk] = artistKeys(entry.forArtist);
    const weight = fk && mine.has(fk) ? mine.get(fk)!.sets / maxSets : 0.5;
    for (const s of entry.similar) {
      const [key] = artistKeys(s.name);
      if (!key || mine.has(key)) continue;
      const r = get(key, s.name);
      r.lfm += s.match * weight;
      r.sources.add("lastfm");
      r.because.set(entry.forArtist, (r.because.get(entry.forArtist) ?? 0) + s.match);
    }
  }

  const maxCooc = Math.max(1e-9, ...[...recs.values()].map((r) => r.cooc));
  const maxLfm = Math.max(1e-9, ...[...recs.values()].map((r) => r.lfm));
  return [...recs.entries()]
    .map(([key, r]) => ({
      key,
      name: r.name,
      // Found by both signals → clearly ahead of single-signal artists.
      score: r.cooc / maxCooc + r.lfm / maxLfm + (r.sources.size > 1 ? 0.5 : 0),
      because: [...r.because.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([n]) => n),
      sources: [...r.sources],
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export interface DigTrack extends ExploreTrack {
  setId: string;
  setTitle: string;
  /** The user's artist this track is by. */
  viaArtist: string;
}

/** Tracks by the user's artists that other sets play and the user's sets don't have. */
export function tracksToDig(
  taste: NamedCount[],
  mySets: ExploreSet[],
  otherSets: ExploreSet[],
  limit = 30,
): DigTrack[] {
  const mine = new Map(taste.map((a) => [a.key, a]));
  const known = new Set(mySets.flatMap((s) => s.tracks.map(trackKey)));
  const seen = new Set<string>();
  const out: (DigTrack & { weight: number })[] = [];
  for (const set of otherSets) {
    for (const t of trusted(set.tracks)) {
      const key = trackKey(t);
      if (known.has(key) || seen.has(key)) continue;
      const via = splitArtists(t.artist)
        .map((a) => mine.get(a.key))
        .find(Boolean);
      if (!via) continue;
      seen.add(key);
      out.push({ ...t, setId: set.id, setTitle: set.title, viaArtist: via.name, weight: via.sets });
    }
  }
  return out
    .sort((a, b) => b.weight - a.weight || a.artist.localeCompare(b.artist))
    .slice(0, limit)
    .map((t) => {
      const copy: DigTrack & { weight?: number } = { ...t };
      delete copy.weight;
      return copy;
    });
}

export interface SimilarDbSet {
  set: ExploreSet;
  sharedArtists: string[];
}

/** Sets already in the database (tracklist ready, free) that share the most artists with the user's. */
export function similarDbSets(
  taste: NamedCount[],
  otherSets: ExploreSet[],
  limit = 6,
): SimilarDbSet[] {
  const mine = new Map(taste.map((a) => [a.key, a.name]));
  return otherSets
    .map((set) => {
      const shared = new Map<string, string>();
      for (const t of trusted(set.tracks))
        for (const a of splitArtists(t.artist))
          if (mine.has(a.key)) shared.set(a.key, mine.get(a.key)!);
      return { set, sharedArtists: [...shared.values()] };
    })
    .filter((s) => s.sharedArtists.length >= 2)
    .sort((a, b) => b.sharedArtists.length - a.sharedArtists.length)
    .slice(0, limit);
}

export interface RelatedSet {
  scId: number;
  url: string;
  title: string;
  username: string;
  durationSecs: number;
  artworkUrl: string | null;
}

export interface RankedRelatedSet extends RelatedSet {
  /** How many of the user's sets SoundCloud relates it to. */
  relatedTo: number;
  score: number;
}

/** Only DJ sets, not single tracks: SoundCloud's "related" mixes both. */
export const MIN_SET_SECS = 30 * 60;

/**
 * Merges SoundCloud "related" lists of several of the user's sets. A set related to
 * several of them ranks first; within a list, earlier positions weigh more.
 */
export function rankRelatedSets(
  perSource: { sourceUrl: string; related: RelatedSet[] }[],
  excludeUrls: Set<string>,
  limit = 12,
): RankedRelatedSet[] {
  const byId = new Map<number, RankedRelatedSet>();
  for (const { related } of perSource) {
    related.forEach((r, i) => {
      if (r.durationSecs < MIN_SET_SECS || excludeUrls.has(r.url)) return;
      const cur = byId.get(r.scId) ?? { ...r, relatedTo: 0, score: 0 };
      cur.relatedTo++;
      cur.score += 1 + 1 / (i + 1);
      byId.set(r.scId, cur);
    });
  }
  return [...byId.values()]
    .sort((a, b) => b.relatedTo - a.relatedTo || b.score - a.score)
    .slice(0, limit);
}

export interface LabelRec {
  key: string;
  name: string;
  /** The user's artists releasing on it. */
  yourArtists: string[];
  /** Recommended artists releasing on it. */
  recArtists: string[];
  /** Tracks on it found in other users' sets (by the user's or recommended artists). */
  tracks: number;
  /** How many of the user's sets already play it (0–2: rarely). */
  inYourSets: number;
  score: number;
}

/** A label already in this many of the user's sets is known, not a discovery. */
export const KNOWN_LABEL_SETS = 3;

/**
 * Labels worth exploring:
 *  - labels that release several of the user's artists (a label releasing 3 of them is
 *    a strong taste signal), weighted 2 per artist
 *  - labels that release recommended artists, 1 per artist
 *  - labels on other users' tracks by those artists, 0.5 per track
 * Labels the user already plays in ≥3 sets are left out. A suggestion needs 2+ artists,
 * or one artist with several releases there, so one-off releases don't fill the list.
 */
export function recommendLabels(
  myLabels: NamedCount[],
  artistLabels: { artist: string; mine: boolean; labels: { name: string; releases: number }[] }[],
  otherTracks: ExploreTrack[],
  limit = 12,
): LabelRec[] {
  const known = new Map(myLabels.map((l) => [l.key, l.sets]));
  const recs = new Map<
    string,
    {
      names: Map<string, number>;
      yours: Set<string>;
      rec: Set<string>;
      releases: number;
      tracks: number;
    }
  >();
  const get = (name: string) => {
    const key = labelKey(name);
    if (!key || (known.get(key) ?? 0) >= KNOWN_LABEL_SETS) return null;
    const r = recs.get(key) ?? {
      names: new Map(),
      yours: new Set(),
      rec: new Set(),
      releases: 0,
      tracks: 0,
    };
    r.names.set(name, (r.names.get(name) ?? 0) + 1);
    recs.set(key, r);
    return r;
  };

  for (const { artist, mine, labels } of artistLabels) {
    for (const l of labels) {
      const r = get(l.name);
      if (!r) continue;
      (mine ? r.yours : r.rec).add(artist);
      r.releases += l.releases;
    }
  }
  for (const t of trusted(otherTracks)) {
    if (!t.label) continue;
    const r = get(t.label);
    if (!r) continue;
    r.tracks++;
  }

  return [...recs.entries()]
    .filter(([, r]) => r.yours.size + r.rec.size >= 2 || r.releases >= 3 || r.tracks >= 2)
    .map(([key, r]) => ({
      key,
      name: [...r.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      yourArtists: [...r.yours],
      recArtists: [...r.rec],
      tracks: r.tracks,
      inYourSets: known.get(key) ?? 0,
      score: 2 * r.yours.size + r.rec.size + 0.5 * r.tracks + Math.min(r.releases, 10) * 0.1,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}
