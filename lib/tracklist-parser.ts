export interface ParsedTrack {
  artist: string;
  title: string;
  timestamp?: string;
}

const JUNK_PATTERNS = [
  /https?:\/\/\S+/g,
  /follow\s+\w+\s+on\s+\w+/gi,
  /free\s+download/gi,
  /buy\s+now/gi,
  /out\s+now/gi,
  /@\w+/g,
  /\bfacebook\b|\binstagram\b|\btwitter\b|\bsoundcloud\b|\byoutube\b/gi,
];

const TIMESTAMP_RE = /^(\d{1,2}[:.:]\d{2}(?:[:.:]\d{2})?)\s*/;
const NUMBERED_RE = /^\d{1,3}[.)]\s+/;

// Patterns: try most specific first
const PATTERNS: Array<{
  re: RegExp;
  extract: (m: RegExpMatchArray) => { artist: string; title: string };
}> = [
  {
    // 00:00 Artist - Track Name
    re: /^(?:\d{1,2}[:.:]\d{2}(?:[:.:]\d{2})?\s+[-–]?\s*)(.+?)\s+[-–]\s+(.+)$/,
    extract: (m) => ({ artist: m[1].trim(), title: m[2].trim() }),
  },
  {
    // 1. Artist - Track Name
    re: /^\d{1,3}[.)]\s+(.+?)\s+[-–]\s+(.+)$/,
    extract: (m) => ({ artist: m[1].trim(), title: m[2].trim() }),
  },
  {
    // Artist - "Track Name"
    re: /^(.+?)\s+[-–]\s+["""'''](.+)["""''']\s*$/,
    extract: (m) => ({ artist: m[1].trim(), title: m[2].trim() }),
  },
  {
    // Artist - Track Name  (plain, no number/timestamp)
    re: /^(.+?)\s+[-–]\s+(.+)$/,
    extract: (m) => ({ artist: m[1].trim(), title: m[2].trim() }),
  },
];

export function parseTracklist(text: string): ParsedTrack[] {
  if (!text) return [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && l.length < 300);

  const tracks: ParsedTrack[] = [];

  for (const raw of lines) {
    let line = cleanJunk(raw);
    if (!line) continue;

    const tsMatch = line.match(TIMESTAMP_RE);
    const timestamp = tsMatch ? normalizeTimestamp(tsMatch[1]) : undefined;
    if (tsMatch) line = line.slice(tsMatch[0].length).trim();

    // Strip leading number if present
    line = line.replace(NUMBERED_RE, "");

    for (const { re, extract } of PATTERNS) {
      const m = line.match(re);
      if (m) {
        const { artist, title } = extract(m);
        if (artist.length > 1 && title.length > 1 && !looksLikeGarbage(artist, title)) {
          tracks.push({ artist: cleanField(artist), title: cleanField(title), timestamp });
          break;
        }
      }
    }
  }

  return dedup(tracks);
}

function cleanJunk(line: string): string {
  let l = line;
  for (const p of JUNK_PATTERNS) l = l.replace(p, "");
  return l.trim();
}

function cleanField(s: string): string {
  return s
    .replace(/^["""''']+|["""''']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTimestamp(ts: string): string {
  return ts.replace(/\./g, ":");
}

function looksLikeGarbage(artist: string, title: string): boolean {
  const combined = artist + title;
  // Too many special chars, probably not a track
  if ((combined.match(/[#@!$%^&*]/g) ?? []).length > 3) return true;
  if (artist.length > 80 || title.length > 120) return true;
  return false;
}

function dedup(tracks: ParsedTrack[]): ParsedTrack[] {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    const key = `${t.artist.toLowerCase()}||${t.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
