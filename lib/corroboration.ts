/**
 * Same-artist corroboration: DJs often play several tracks by one artist in a set.
 * A doubtful match (low score, heard once) whose artist also appears on another
 * track of the set is very unlikely to be a random false match, so it's confirmed.
 * Two doubtful tracks by the same artist confirm each other.
 * Pure logic, no I/O.
 */
import { normalizeTitle } from "./sampling-plan";

// Placeholders that say nothing about who made the track.
const IGNORED_ARTISTS = new Set([
  "unknown",
  "unknown artist",
  "various artists",
  "various",
  "va",
  "id",
  "n a",
]);

/** "Hertz Collision, Sera J" → ["hertz collision", "sera j"]; "A feat. B" → ["a", "b"]. */
export function artistKeys(artist: string): string[] {
  return artist
    .split(/\s*(?:,|&|\+|\/|;|\bfeat\.?|\bft\.?|\bfeaturing\b|\bvs\.?|\bx\b|\band\b)\s*/i)
    .map((a) => normalizeTitle(a))
    .filter((k) => k.length >= 2 && !IGNORED_ARTISTS.has(k));
}

/**
 * Indices of the tracks that share an artist with `tracks[index]`, including `index`
 * itself. Empty when no other track shares an artist.
 */
export function sameArtistGroup(tracks: { artist: string }[], index: number): number[] {
  const keys = new Set(artistKeys(tracks[index].artist));
  if (keys.size === 0) return [];
  const group = tracks
    .map((t, i) => (i !== index && artistKeys(t.artist).some((k) => keys.has(k)) ? i : -1))
    .filter((i) => i >= 0);
  return group.length > 0 ? [index, ...group] : [];
}
