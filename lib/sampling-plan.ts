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
export const MISS_STEP_SECS = 90; // single miss with no retry possible
export const DOUBLE_MISS_STEP_SECS = 180; // primary + retry both missed → likely unknown track

export const SPARSE_CHECK_AFTER_CALLS = 15;
export const SPARSE_MAX_HIT_RATE = 0.1;

// Playback rate outside this range means the DJ jumped (hot cue) or looped,
// not a tempo change: CDJ/Traktor pitch ranges used in practice stay within ±15%.
const RATE_MIN = 0.85;
const RATE_MAX = 1.15;

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
  const sameSong = !!prev && prev.title.toLowerCase() === cur.title.toLowerCase();
  let unreliable = sameSong ? prev!.unreliable : false;
  let rate = sameSong ? prev!.rate : undefined;
  let rateNote = "";

  if (sameSong && !unreliable && prev!.playOffsetSecs != null && cur.playOffsetSecs != null) {
    const mixDelta = cur.mixOffsetSecs - prev!.mixOffsetSecs;
    const songDelta = cur.playOffsetSecs - prev!.playOffsetSecs;
    if (mixDelta > 0) {
      const r = songDelta / mixDelta;
      if (r < RATE_MIN || r > RATE_MAX) {
        unreliable = true;
        rateNote = ` (song moved ${Math.round(songDelta)}s in ${Math.round(mixDelta)}s of mix → hot cue/loop, ignoring song length)`;
      } else {
        rate = r;
        rateNote = ` (rate ${r.toFixed(2)}x)`;
      }
    }
  }

  const tracked: TrackedMatch = { ...cur, rate, unreliable };

  const { playOffsetSecs: pos, durationSecs: dur } = cur;
  if (!unreliable && pos != null && dur != null && dur > pos) {
    const remaining = (dur - pos) / (rate ?? 1);
    const step = clamp(remaining - OUTRO_MARGIN_SECS, MIN_STEP_SECS, MAX_STEP_SECS);
    return {
      step,
      reason: `${sameSong ? "same song, " : ""}~${Math.round(remaining)}s left in song${rateNote}`,
      tracked,
    };
  }

  if (sameSong) {
    return { step: SAME_TRACK_STEP_SECS, reason: `same song still playing, no usable timing${rateNote}`, tracked };
  }
  return { step: MAX_STEP_SECS, reason: "no song timing from recognizer", tracked };
}

export function stepAfterMiss(retriedAndMissed: boolean): { step: number; reason: string } {
  return retriedAndMissed
    ? { step: DOUBLE_MISS_STEP_SECS, reason: "missed twice → likely unknown track" }
    : { step: MISS_STEP_SECS, reason: "missed" };
}

/**
 * Sets that are mostly unreleased IDs (e.g. underground club sets) waste most calls.
 * Once that's evident, stop retrying and probe sparsely. Re-evaluated every probe,
 * so it switches back off if matches pick up.
 */
export function isSparseMode(calls: number, recognitions: number): boolean {
  return calls >= SPARSE_CHECK_AFTER_CALLS && recognitions / calls < SPARSE_MAX_HIT_RATE;
}
