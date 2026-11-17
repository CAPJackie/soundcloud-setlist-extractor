/**
 * Finds track IDs that listeners posted in a set's SoundCloud comments, e.g.
 *   "6:20 TrackID: Moerbeck, Subjected - 006.CE"
 *   "@someone oblivion - Boston 168 😉"
 * Most comments are questions ("track id?") or reactions, so the rules are strict:
 * a comment must look like "Artist - Title" after cleanup, or it's ignored.
 *
 * Trust: an answer from the DJ playing the set is reliable; one from a listener may
 * be wrong. The DJ is recognized by account (the uploader) or by name: the set title
 * or the uploader's name contains it (sets are often uploaded by a club or label).
 * Pure logic, no I/O.
 */
import type { SoundCloudComment } from "./soundcloud";
import { normalizeTitle } from "./sampling-plan";

export interface CommentTrack {
  artist: string;
  title: string;
  /** Where in the mix: a time written in the comment wins over where it's pinned. */
  offsetSecs: number | null;
  /** Distinct users who posted this ID. */
  mentions: number;
  /** Posted by the DJ of the set → reliable. */
  fromArtist: boolean;
}

export interface SetContext {
  title: string;
  uploaderId: number | null;
  uploaderName: string;
  uploaderPermalink: string;
}

// Words that say nothing about who someone is: a listener called "Techno" or
// "Berlin" must not count as the artist just because the title contains it.
const GENERIC_NAME_WORDS = new Set([
  "dj", "djs", "official", "music", "records", "recordings", "sounds", "sound", "audio", "live", "set", "sets",
  "mix", "mixes", "mixed", "by", "the", "techno", "house", "berlin", "berghain", "club", "radio", "podcast",
  "underground", "rave", "b2b", "at", "and", "vs",
]);

/** "◽◾ JARYMANE ◾◽" → "jarymane", "Parallx [ISARN]" → "parallx", "jary_mane" → "jary mane". */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w && w !== "official")
    .join(" ");
}

const compact = (k: string) => k.replace(/ /g, "");
const isDistinctive = (k: string) => compact(k).length >= 4 && k.split(" ").some((w) => !GENERIC_NAME_WORDS.has(w));

/** Is this commenter the DJ of the set? */
export function isSetArtist(
  c: Pick<SoundCloudComment, "userId" | "username" | "userPermalink">,
  ctx: SetContext
): boolean {
  if (c.userId != null && ctx.uploaderId != null && c.userId === ctx.uploaderId) return true;

  const authorKeys = [nameKey(c.username), nameKey(c.userPermalink)].filter(isDistinctive);
  if (authorKeys.length === 0) return false;
  const uploaderKeys = [nameKey(ctx.uploaderName), nameKey(ctx.uploaderPermalink)].filter(isDistinctive);
  const titleKey = nameKey(ctx.title);

  return authorKeys.some((a) => {
    // Same name as the uploader, spacing aside ("jary mane" = "jarymane"), or one contains
    // the other as whole words ("parallx" ⊂ "parallx bln").
    if (uploaderKeys.some((u) => compact(u) === compact(a) || ` ${u} `.includes(` ${a} `) || ` ${a} `.includes(` ${u} `))) {
      return true;
    }
    // Named in the title: as whole words, or glued ("Mixed by JARYMANE" vs "jary_mane").
    return ` ${titleKey} `.includes(` ${a} `) || (compact(a).length >= 5 && compact(titleKey).includes(compact(a)));
  });
}

// Words that show the "Artist - Title" is really a reaction ("Parallx - legend").
const REACTION_WORDS =
  /\b(set|legend|legends|banger|bangers|fire|insane|amazing|love|thanks|thank|please|pls|plz|repeat|best|ever|crazy|wow|goat|tune|vibes?|mood|peak|perfect|incredible|unreal|madness|lol|haha)\b/i;

const PREFIX_RE =
  /^(?:(?:track\s*id|trackid|id|track|tune|song|it['’]?s|this is|that['’]?s|thats|is)\b|[=:\-–—])\s*(?:is\b\s*)?[:\-–—]?\s*/i;

const TIME_RE = /^(\d{1,3}):(\d{2})(?::(\d{2}))?\b\s*/;

function cleanLine(line: string): string {
  return line
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[\w.-]+/g, " ")
    .replace(/\p{Extended_Pictographic}|️|‍/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTime(m: RegExpMatchArray): number {
  const [a, b, c] = [Number(m[1]), Number(m[2]), m[3] != null ? Number(m[3]) : null];
  return c != null ? a * 3600 + b * 60 + c : a * 60 + b;
}

function plausible(part: string): boolean {
  const words = part.split(/\s+/).length;
  return part.length >= 2 && part.length <= 80 && words <= 8 && /\p{L}/u.test(part) && !REACTION_WORDS.test(part);
}

/** One comment line → {artist, title, time written in it} or null. */
export function parseCommentLine(raw: string): { artist: string; title: string; writtenSecs: number | null } | null {
  if (raw.includes("?")) return null; // questions, not answers
  let line = cleanLine(raw);
  let writtenSecs: number | null = null;

  const time = line.match(TIME_RE);
  if (time) {
    writtenSecs = parseTime(time);
    line = line.slice(time[0].length);
  }
  for (let i = 0; i < 3; i++) {
    const next = line.replace(PREFIX_RE, "");
    if (next === line) break;
    line = next;
  }

  const m = line.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (!m) return null;
  const artist = m[1].trim().replace(/[.,;:!]+$/, "");
  const title = m[2].trim().replace(/[.,;:!]+$/, "");
  if (!plausible(artist) || !plausible(title)) return null;
  return { artist, title, writtenSecs };
}

export function parseCommentIds(comments: SoundCloudComment[], ctx: SetContext): CommentTrack[] {
  const byKey = new Map<string, CommentTrack & { users: Set<string> }>();
  const uploaderKey = normalizeTitle(ctx.uploaderName);

  for (const c of comments) {
    const fromArtist = isSetArtist(c, ctx);
    for (const rawLine of c.body.split(/\r?\n/)) {
      const parsed = parseCommentLine(rawLine);
      if (!parsed) continue;
      // A listener writing "Parallx - something" is almost always a reaction. The DJ
      // writing it can be their own track, so that one is kept.
      if (!fromArtist && uploaderKey && normalizeTitle(parsed.artist) === uploaderKey) continue;

      const key = normalizeTitle(parsed.title);
      if (!key) continue;
      const offsetSecs = parsed.writtenSecs ?? (c.timestampMs != null ? Math.floor(c.timestampMs / 1000) : null);
      const existing = byKey.get(key);
      if (existing) {
        existing.users.add(c.username);
        existing.mentions = existing.users.size;
        if (fromArtist && !existing.fromArtist) {
          // The DJ's spelling and timing win over a listener's.
          Object.assign(existing, { artist: parsed.artist, title: parsed.title, fromArtist: true });
          if (offsetSecs != null) existing.offsetSecs = offsetSecs;
        } else if (existing.offsetSecs == null) {
          existing.offsetSecs = offsetSecs;
        }
      } else {
        byKey.set(key, {
          artist: parsed.artist,
          title: parsed.title,
          offsetSecs,
          mentions: 1,
          fromArtist,
          users: new Set([c.username]),
        });
      }
    }
  }

  return [...byKey.values()]
    .map((t) => ({ artist: t.artist, title: t.title, offsetSecs: t.offsetSecs, mentions: t.mentions, fromArtist: t.fromArtist }))
    .sort((a, b) => (a.offsetSecs ?? Infinity) - (b.offsetSecs ?? Infinity));
}
