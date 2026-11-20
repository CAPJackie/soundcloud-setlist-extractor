/**
 * Decides where to probe next in a DJ mix.
 *
 * Core rule: track metadata (song length, position in song) may only make the
 * next jump SHORTER than MAX_STEP_SECS, never longer. Every jump is a guess that
 * the next probe verifies, so a wrong guess is never worse than a fixed step.
 *
 * Why metadata can't be trusted blindly:
 *  - DJs rarely play a track in full, and hot cues / loops jump around inside it.
 *  - Pitch/tempo changes (typically ±3–8%) shorten or stretch the track.
 * So the song's remaining time is treated as an upper bound, corrected by the
 * playback rate measured from two matches of the same song, and discarded when
 * that rate is implausible (hot cue or loop detected).
 */

export const MAX_STEP_SECS = 180; // never jump further than this after a match
export const MIN_STEP_SECS = 30;
export const OUTRO_MARGIN_SECS = 90; // DJs usually start blending ~90s before the end
export const SAME_TRACK_STEP_SECS = 60; // song still playing, no usable timing → check again soon
export const MISS_STEP_SECS = 90; // clean mix, single miss with no retry possible
export const DENSE_MISS_STEP_SECS = 150; // layered mix: the same blend lasts minutes, move on
export const DOUBLE_MISS_STEP_SECS = 180; // primary + retry both missed → likely unknown track
export const SPARSE_MISS_STEP_SECS = 180; // stretch of mostly unknown tracks

/** ACRCloud scores below this are shown as "low confidence" until the song is heard again. */
export const LOW_CONFIDENCE_SCORE = 60;

// Mix mode is judged on the last MODE_WINDOW probes, not the whole set: long sets
// alternate between stretches of known tracks and long stretches of IDs.
export const MODE_WINDOW = 20;
export const MODE_MIN_PROBES = 8;
export const CLEAN_MIN_HIT_RATE = 0.35;
export const SPARSE_MAX_HIT_RATE = 0.1;
// Hysteresis: leaving a mode needs a clearer signal than entering it, so one hit
// moving in or out of the window doesn't flip the mode back and forth.
export const CLEAN_EXIT_HIT_RATE = 0.25;
export const SPARSE_EXIT_HIT_RATE = 0.15;

// The +25s retry only pays off when transitions are short (2-deck mixing). It is
// tried in clean stretches and dropped for the rest of the run once it's shown
// not to work (3+ deck sets keep the same layered blend for minutes).
export const RETRY_TRIAL = 8;
export const RETRY_MIN_HIT_RATE = 0.15;

// Playback rate outside this range means the DJ jumped (hot cue) or looped,
// not a tempo change: CDJ/Traktor pitch ranges used in practice stay within ±15%.
const RATE_MIN = 0.85;
const RATE_MAX = 1.15;
// ACRCloud's position-in-song is only accurate to roughly ±15s (it matches somewhere
// inside a ~30s sample), so rate is only measured over gaps long enough to absorb that.
const RATE_MIN_WINDOW_SECS = 90;
// Over shorter gaps, only a drift bigger than the position noise counts as a jump.
const JUMP_TOLERANCE_SECS = 45;

/**
 * Same-song key: ignores case, punctuation and version tags that don't change the
 * recording ("Original Mix", "Extended Mix", "Radio Edit", "Remastered"). Remix names
 * are kept on purpose: "Track (X Remix)" is a different recording than "Track".
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[([]\s*(original|extended|club)( mix| version)?\s*[)\]]/g, " ")
    .replace(/[([]\s*radio edit\s*[)\]]/g, " ")
    .replace(/[([]\s*remaster(ed)?( \d{4})?\s*[)\]]/g, " ")
    .replace(/\s+-\s+(original|extended|club) mix\s*$/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface MatchTiming {
  title: string;
  /** Where in the mix the sample starts. */
  mixOffsetSecs: number;
  /** Where in the original song the sample is (from ACRCloud play_offset_ms). */
  playOffsetSecs?: number;
  /** Original song length (from ACRCloud duration_ms). */
  durationSecs?: number;
}

export interface TrackedMatch extends MatchTiming {
  /** Playback speed vs. original, measured from two matches of the same song. */
  rate?: number;
  /** Timing data for this song is unusable (hot cue / loop detected). */
  unreliable: boolean;
}

export interface StepDecision {
  step: number;
  reason: string;
  tracked: TrackedMatch;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function stepAfterMatch(prev: TrackedMatch | undefined, cur: MatchTiming): StepDecision {
  const sameSong = !!prev && normalizeTitle(prev.title) === normalizeTitle(cur.title);
  let unreliable = sameSong ? prev!.unreliable : false;
  let rate = sameSong ? prev!.rate : undefined;
  let rateNote = "";

  if (sameSong && !unreliable && prev!.playOffsetSecs != null && cur.playOffsetSecs != null) {
    const mixDelta = cur.mixOffsetSecs - prev!.mixOffsetSecs;
    const songDelta = cur.playOffsetSecs - prev!.playOffsetSecs;
    const jumpNote = ` (song moved ${Math.round(songDelta)}s in ${Math.round(mixDelta)}s of mix → hot cue/loop, ignoring song length)`;
    if (mixDelta >= RATE_MIN_WINDOW_SECS) {
      const r = songDelta / mixDelta;
      if (r < RATE_MIN || r > RATE_MAX) {
        unreliable = true;
        rateNote = jumpNote;
      } else {
        rate = r;
        rateNote = ` (rate ${r.toFixed(2)}x)`;
      }
    } else if (mixDelta > 0 && Math.abs(songDelta - mixDelta) > JUMP_TOLERANCE_SECS) {
      unreliable = true;
      rateNote = jumpNote;
    }
  }

  const tracked: TrackedMatch = { ...cur, rate, unreliable };

  const { playOffsetSecs: pos, durationSecs: dur } = cur;
  if (!unreliable && pos != null && dur != null && dur > pos) {
    const remaining = (dur - pos) / (rate ?? 1);
    // First sighting: land ~90s before the song ends to catch the next track's start.
    // Already confirmed: the song is known to be playing, so jump to where it ends
    // instead of re-confirming it every 30s.
    const step = sameSong
      ? clamp(remaining, MIN_STEP_SECS, MAX_STEP_SECS)
      : clamp(remaining - OUTRO_MARGIN_SECS, MIN_STEP_SECS, MAX_STEP_SECS);
    return {
      step,
      reason: sameSong
        ? `same song, ~${Math.round(remaining)}s left → jumping to its end${rateNote}`
        : `~${Math.round(remaining)}s left in song${rateNote}`,
      tracked,
    };
  }

  if (sameSong) {
    return {
      step: SAME_TRACK_STEP_SECS,
      reason: `same song still playing, no usable timing${rateNote}`,
      tracked,
    };
  }
  return { step: MAX_STEP_SECS, reason: "no song timing from recognizer", tracked };
}

/**
 * - clean:  many recent probes recognized (tracks play clearly, short transitions)
 * - dense:  default; layered 3+ deck mixing, some tracks recognizable
 * - sparse: recent stretch is mostly unknown tracks (IDs / unreleased)
 * Dense until there's enough history, since that's how most underground DJs mix.
 */
export type MixMode = "clean" | "dense" | "sparse";

export function mixMode(recentHits: boolean[], prev?: MixMode | null): MixMode {
  const recent = recentHits.slice(-MODE_WINDOW);
  if (recent.length < MODE_MIN_PROBES) return "dense";
  const rate = recent.filter(Boolean).length / recent.length;
  if (prev === "clean" && rate >= CLEAN_EXIT_HIT_RATE) return "clean";
  if (prev === "sparse" && rate < SPARSE_EXIT_HIT_RATE) return "sparse";
  if (rate >= CLEAN_MIN_HIT_RATE) return "clean";
  if (rate < SPARSE_MAX_HIT_RATE) return "sparse";
  return "dense";
}

/** Retries stay allowed until RETRY_TRIAL of them show a hit rate below RETRY_MIN_HIT_RATE. */
export function retriesWorthIt(retries: number, retryHits: number): boolean {
  return retries < RETRY_TRIAL || retryHits / retries >= RETRY_MIN_HIT_RATE;
}

export function shouldRetry(mode: MixMode, retries: number, retryHits: number): boolean {
  return mode === "clean" && retriesWorthIt(retries, retryHits);
}

export function stepAfterMiss(
  retriedAndMissed: boolean,
  mode: MixMode,
): { step: number; reason: string } {
  if (retriedAndMissed)
    return { step: DOUBLE_MISS_STEP_SECS, reason: "missed twice → likely unknown track" };
  if (mode === "sparse")
    return {
      step: SPARSE_MISS_STEP_SECS,
      reason: "missed (sparse stretch: mostly unknown tracks)",
    };
  if (mode === "dense")
    return { step: DENSE_MISS_STEP_SECS, reason: "missed (layered mix, no retry)" };
  return { step: MISS_STEP_SECS, reason: "missed" };
}
