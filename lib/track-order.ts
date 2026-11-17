/** "05:10" / "281:10" / "1:23:45" → seconds; null if missing or unparsable. */
export function timestampToSecs(ts?: string): number | null {
  if (!ts) return null;
  const parts = ts.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/**
 * Chronological order when every track has a timestamp (comment IDs arrive before
 * the audio matches). Otherwise discovery order is kept: untimed description tracks
 * can't be placed.
 */
export function sortTracksByTime<T extends { timestamp?: string }>(tracks: T[]): T[] {
  if (!tracks.every((t) => timestampToSecs(t.timestamp) != null)) return tracks;
  return [...tracks].sort((a, b) => timestampToSecs(a.timestamp)! - timestampToSecs(b.timestamp)!);
}
