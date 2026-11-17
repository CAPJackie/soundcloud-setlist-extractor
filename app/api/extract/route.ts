import { NextRequest, after } from "next/server";
import {
  fetchSoundCloudPageHtml,
  fetchSoundCloudTrack,
  extractClientId,
  resolveStreamUrl,
  getHlsTranscodings,
  fetchSoundCloudComments,
} from "@/lib/soundcloud";
import { parseCommentIds } from "@/lib/comment-ids";
import { sameArtistGroup } from "@/lib/corroboration";
import { enrichLabels } from "@/lib/labels";
import { parseTracklist } from "@/lib/tracklist-parser";
import { fetchM3u8Segments, findSegmentIndexNearOffset, downloadProbeBytes, INITIAL_OFFSET_SECS, SHIFT_RETRY_SECS } from "@/lib/hls-chunks";
import { identifyAudio, AcrRateLimitError, ACR_MAX_CALLS_PER_SESSION, type AcrMatch } from "@/lib/acrcloud";
import { stepAfterMatch, stepAfterMiss, mixMode, shouldRetry, retriesWorthIt, normalizeTitle, MISS_STEP_SECS, LOW_CONFIDENCE_SCORE, MODE_WINDOW, type MixMode, type TrackedMatch } from "@/lib/sampling-plan";
import { identifyWithAudd, AUDD_MAX_CALLS_PER_SESSION } from "@/lib/audd";
import { getCachedSetlist, saveSetlist, CachedTrack } from "@/lib/setlist-cache";
import { sortTracksByTime } from "@/lib/track-order";
import { auth } from "@/auth";
import { checkAndRecordRateLimit } from "@/lib/rate-limit";
import { getQuota, incrementMonthlyUsage } from "@/lib/usage";
import { isAcrBudgetExceeded, addAcrCalls } from "@/lib/budget";

export const maxDuration = 300;

/** 75 → "01:15", 16870 → "281:10" (minutes keep counting past 60, like the stored timestamps). */
const formatMmSs = (secs: number) =>
  `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

type SseEvent =
  | { type: "status"; message: string }
  | { type: "warning"; message: string }
  | { type: "resolved"; url: string }
  | { type: "track"; data: { artist: string; title: string; timestamp?: string; lowConfidence?: boolean } }
  | { type: "confirm"; index: number }
  | { type: "error"; message: string }
  | {
      type: "done";
      total: number;
      cached?: boolean;
      title?: string;
      incomplete?: boolean;
      resumeFromSecs?: number | null;
      durationSecs?: number | null;
    };

function encode(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const userEmail = session?.user?.email ?? undefined;

  // Extraction is a metered, authenticated action.
  if (!userEmail) {
    return new Response(
      encode({ type: "error", message: "Please sign in to extract setlists." }),
      { status: 401, headers: sseHeaders() }
    );
  }

  // Anti-abuse burst limiter (distinct from the monthly billing quota below).
  const withinRate = await checkAndRecordRateLimit(userEmail);
  if (!withinRate) {
    return new Response(
      encode({ type: "error", message: "You're going too fast — please wait a moment and try again." }),
      { status: 429, headers: sseHeaders() }
    );
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new Response("Missing url param", { status: 400 });

  const isShortLink = url.startsWith("https://on.soundcloud.com/");
  const isDirectLink = url.startsWith("https://soundcloud.com/");

  if (!isShortLink && !isDirectLink) {
    return new Response(
      encode({ type: "error", message: "Please enter a valid SoundCloud URL" }),
      { headers: sseHeaders() }
    );
  }

  let resolvedUrl = url;
  if (isShortLink) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow" });
      resolvedUrl = cleanSoundCloudUrl(res.url);
      console.log(`[extract] short link resolved: ${resolvedUrl}`);
    } catch {
      return new Response(
        encode({ type: "error", message: "Could not resolve SoundCloud link." }),
        { headers: sseHeaders() }
      );
    }
    if (!resolvedUrl.startsWith("https://soundcloud.com/")) {
      return new Response(
        encode({ type: "error", message: "Please enter a valid SoundCloud URL" }),
        { headers: sseHeaders() }
      );
    }
  } else {
    resolvedUrl = cleanSoundCloudUrl(url);
  }

  console.log(`[extract] ${resolvedUrl} (user: ${userEmail ?? "anonymous"})`);

  const canonicalUrl = resolvedUrl;

  // Labels for tracks ACRCloud didn't label are looked up after the response is done
  // (slow, rate-limited APIs). `after` must be registered here, in request scope; the
  // stream hands over the final tracks when it closes.
  let finalTracks: CachedTrack[] = [];
  let tracksDone: () => void = () => {};
  const tracksReady = new Promise<void>((resolve) => (tracksDone = resolve));
  after(async () => {
    await tracksReady;
    if (finalTracks.length > 0) await enrichLabels(finalTracks, 120_000).catch(() => {});
  });

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const close = () => { if (!closed) { closed = true; controller.close(); } };
      const emit = (event: SseEvent) => {
        if (!closed) controller.enqueue(encode(event));
        if (event.type === "status") console.log(`[extract] ${event.message}`);
        else if (event.type === "warning") console.warn(`[extract] WARN ${event.message}`);
        else if (event.type === "resolved") console.log(`[extract] resolved url: ${event.url}`);
        else if (event.type === "error") console.error(`[extract] ERROR ${event.message}`);
        else if (event.type === "track") console.log(`[extract] track: ${event.data.artist} — ${event.data.title}${event.data.timestamp ? ` @ ${event.data.timestamp}` : ""}${event.data.lowConfidence ? " (low confidence)" : ""}`);
        else if (event.type === "confirm") console.log(`[extract] confirmed track #${event.index + 1}`);
        else if (event.type === "done") console.log(`[extract] done: ${event.total} tracks${event.cached ? " (cached)" : ""}`);
      };

      try {
        if (canonicalUrl !== url) {
          emit({ type: "resolved", url: canonicalUrl });
        }
        // --- Cache check ---
        emit({ type: "status", message: "Checking cache..." });
        const cached = await getCachedSetlist(canonicalUrl).catch(() => null);
        if (cached && !cached.incomplete) {
          emit({ type: "status", message: `Found cached result from ${cached.cachedAt.toLocaleDateString()}` });
          for (const t of cached.tracks) {
            emit({ type: "track", data: t });
          }
          emit({ type: "done", total: cached.tracks.length, cached: true, title: cached.title });
          close();
          return;
        }

        // A previous run was cut off: show what it found, then continue from where it stopped.
        const resume = cached?.incomplete ? cached : null;
        if (resume) {
          for (const t of resume.tracks) emit({ type: "track", data: t });
        }
        // If we can't continue right now, still show the partial result instead of an error.
        const stopWithPartial = (message: string) => {
          emit({ type: "warning", message });
          emit({
            type: "done",
            total: resume!.tracks.length,
            cached: true,
            title: resume!.title,
            incomplete: true,
            resumeFromSecs: resume!.resumeFromSecs ?? null,
            durationSecs: resume!.durationSecs ?? null,
          });
          close();
        };

        // --- Cache miss (or resume): this is a real (billable) extraction. Enforce quota + global budget. ---
        const quota = await getQuota(userEmail);
        if (!quota.allowed) {
          const message =
            quota.plan === "pro"
              ? `You've reached your monthly limit of ${quota.limit} extractions.`
              : `You've used all ${quota.limit} free extractions this month. Upgrade to Pro for more.`;
          if (resume) return stopWithPartial(`${message} This setlist is incomplete.`);
          emit({ type: "error", message });
          close();
          return;
        }
        if (await isAcrBudgetExceeded()) {
          const message = "The service is temporarily at capacity. Please try again later.";
          if (resume) return stopWithPartial(`${message} This setlist is incomplete.`);
          emit({ type: "error", message });
          close();
          return;
        }

        // --- Fetch SoundCloud page ---
        emit({ type: "status", message: "Fetching SoundCloud page..." });
        const [html, track] = await Promise.all([
          fetchSoundCloudPageHtml(canonicalUrl),
          fetchSoundCloudTrack(canonicalUrl),
        ]);

        emit({ type: "status", message: `Found: ${track.title} by ${track.username}` });

        const collectedTracks: CachedTrack[] = resume ? resume.tracks.map((t) => ({ ...t })) : [];
        // Clears doubtful flags on tracks sharing an artist with collectedTracks[index].
        const corroborate = (index: number) => {
          for (const i of sameArtistGroup(collectedTracks, index)) {
            if (!collectedTracks[i].lowConfidence) continue;
            delete collectedTracks[i].lowConfidence;
            console.log(`[extract] same artist as another track: ${collectedTracks[i].artist} — ${collectedTracks[i].title}`);
            emit({ type: "confirm", index: i });
          }
        };

        // --- Tier 1: description parsing (already done by the run being resumed) ---
        const parsed = resume ? [] : parseTracklist(track.description);

        if (parsed.length >= 3) {
          emit({ type: "status", message: `Found ${parsed.length} tracks in description` });
          for (const t of parsed) {
            emit({ type: "track", data: t });
            collectedTracks.push(t);
          }
          await saveSetlist({
            url: canonicalUrl,
            title: track.title,
            username: track.username,
            publishedAt: track.publishedAt,
            tracks: collectedTracks,
            scTrackId: track.id,
          }, userEmail).catch(() => {});
          await incrementMonthlyUsage(userEmail).catch(() => {});
          emit({ type: "done", total: collectedTracks.length, title: track.title });
          close();
          return;
        }

        if (parsed.length > 0) {
          emit({ type: "status", message: `Found ${parsed.length} tracks in description, enriching with audio fingerprinting...` });
          for (const t of parsed) {
            emit({ type: "track", data: t });
            collectedTracks.push(t);
          }
        } else if (resume) {
          emit({ type: "status", message: `Continuing the previous extraction from ~${Math.floor((resume.resumeFromSecs ?? 0) / 60)}:00...` });
        } else {
          emit({ type: "status", message: "No tracklist in description — analyzing audio..." });
        }

        // --- Tier 2: audio fingerprinting ---
        emit({ type: "status", message: "Extracting SoundCloud credentials..." });
        const clientId = await extractClientId(html);
        if (!clientId) {
          emit({ type: "error", message: "Could not extract SoundCloud client ID. The page may have changed." });
          close();
          return;
        }

        // --- Comments: listeners often post track IDs. Free (no ACR calls), so always checked. ---
        if (track.id != null) {
          emit({ type: "status", message: "Checking comments for track IDs..." });
          const comments = await fetchSoundCloudComments(track.id, clientId);
          const ids = parseCommentIds(comments, {
            title: track.title,
            uploaderId: track.userId,
            uploaderName: track.username,
            uploaderPermalink: track.userPermalink,
          });
          const known = new Set(collectedTracks.map((t) => normalizeTitle(t.title)));
          let added = 0;
          for (const c of ids) {
            const key = normalizeTitle(c.title);
            if (known.has(key)) continue;
            known.add(key);
            const t: CachedTrack = {
              artist: c.artist,
              title: c.title,
              ...(c.offsetSecs != null ? { timestamp: formatMmSs(c.offsetSecs) } : {}),
              // The DJ's own answer is reliable. A listener's may be wrong until a 2nd listener
              // or an audio match confirms it.
              ...(!c.fromArtist && c.mentions < 2 ? { lowConfidence: true } : {}),
            };
            collectedTracks.push(t);
            emit({ type: "track", data: t });
            added++;
          }
          const fromArtist = ids.filter((c) => c.fromArtist).length;
          console.log(
            `[comments] ${comments.length} comments → ${ids.length} track IDs (${fromArtist} from the artist, ${added} new)`
          );
          if (added > 0) emit({ type: "status", message: `Found ${added} track ID${added === 1 ? "" : "s"} in comments` });
        }
        // Covers comment IDs and tracks saved by an earlier run (sets cut off before this rule existed).
        collectedTracks.forEach((_, i) => corroborate(i));

        const hlsTranscodings = getHlsTranscodings(track.transcodings);
        if (hlsTranscodings.length === 0) {
          emit({ type: "error", message: "No HLS stream found for this track." });
          close();
          return;
        }

        emit({ type: "status", message: "Resolving audio stream..." });
        let m3u8Url: string | null = null;
        for (const t of hlsTranscodings) {
          m3u8Url = await resolveStreamUrl(t.url, clientId);
          if (m3u8Url) break;
        }
        if (!m3u8Url) {
          emit({ type: "error", message: "Could not resolve stream URL. The track may be private." });
          close();
          return;
        }

        emit({ type: "status", message: "Loading audio segments..." });
        const allSegments = await fetchM3u8Segments(m3u8Url);
        const totalDuration = allSegments[allSegments.length - 1]?.offsetSecs ?? 0;

        emit({ type: "status", message: "Analyzing audio samples across the set..." });

        // normalized title → index in collectedTracks (same order as emitted to the client)
        const seenTitles = new Map(collectedTracks.map((t, i) => [normalizeTitle(t.title), i]));
        const visitedUrls = new Set<string>();
        let targetOffset = resume?.resumeFromSecs ?? INITIAL_OFFSET_SECS;
        // Set when the run stops before the end of the mix (limits, client gone).
        let resumeFromSecs: number | null = null;
        // Client closed the connection: user's choice, so it's billed (unlike our own limits).
        let clientAborted = false;
        let auddCalls = 0;
        let acrCalls = 0;
        let acrPrimaryCalls = 0;
        let acrRetryCalls = 0;
        let probes = 0;
        let matches = 0; // new tracks added
        let recognitions = 0; // any successful identification, incl. repeats of the same song
        let lastMatch: TrackedMatch | undefined;
        // Outcome of each recent probe (primary + optional retry) → decides the mix mode.
        const recentHits: boolean[] = [];
        let lastMode: MixMode | null = null;
        let retryHits = 0;
        let retriesOffLogged = false;

        while (targetOffset <= totalDuration) {
          if (req.signal.aborted) {
            resumeFromSecs = targetOffset;
            clientAborted = true;
            break;
          }
          let idx = findSegmentIndexNearOffset(allSegments, targetOffset);
          if (idx < 0) break;
          // Short steps can land on a segment a retry already used: move forward instead of stopping.
          while (idx < allSegments.length && visitedUrls.has(allSegments[idx].url)) idx++;
          if (idx >= allSegments.length) break;
          let seg = allSegments[idx];
          visitedUrls.add(seg.url);

          const minutes = Math.floor(seg.offsetSecs / 60);
          emit({ type: "status", message: `Identifying track at ~${minutes}:00...` });

          const mode = mixMode(recentHits, lastMode);
          if (mode !== lastMode) {
            const recent = recentHits.slice(-MODE_WINDOW);
            console.log(
              `[plan] mode: ${lastMode ?? "start"} → ${mode} (${recent.filter(Boolean).length}/${recent.length} recent probes recognized)`
            );
            lastMode = mode;
          }
          if (!retriesOffLogged && !retriesWorthIt(acrRetryCalls, retryHits)) {
            retriesOffLogged = true;
            console.log(`[plan] retries off for this run: ${retryHits}/${acrRetryCalls} retries recognized something`);
          }

          let decision: { step: number; reason: string };
          try {
            if (acrCalls >= ACR_MAX_CALLS_PER_SESSION) {
              emit({ type: "warning", message: `ACRCloud call limit reached (${ACR_MAX_CALLS_PER_SESSION} calls) — this setlist is incomplete.` });
              resumeFromSecs = seg.offsetSecs;
              break;
            }
            const bytes = await downloadProbeBytes(allSegments, idx);
            acrCalls++;
            acrPrimaryCalls++;
            probes++;
            console.log(`[extract] ACR call #${acrCalls} (primary) at ${formatMmSs(seg.offsetSecs)}`);
            let match: AcrMatch | null = await identifyAudio(bytes, seg.offsetSecs);
            let retriedAndMissed = false;

            // Retry-with-shift: the first probe may have landed on a blend between two tracks.
            if (!match && shouldRetry(mode, acrRetryCalls, retryHits)) {
              const retryIdx = findSegmentIndexNearOffset(allSegments, seg.offsetSecs + SHIFT_RETRY_SECS);
              if (
                retryIdx >= 0 &&
                retryIdx !== idx &&
                !visitedUrls.has(allSegments[retryIdx].url) &&
                acrCalls < ACR_MAX_CALLS_PER_SESSION
              ) {
                const retrySeg = allSegments[retryIdx];
                visitedUrls.add(retrySeg.url);
                try {
                  const retryBytes = await downloadProbeBytes(allSegments, retryIdx);
                  acrCalls++;
                  acrRetryCalls++;
                  console.log(`[extract] ACR call #${acrCalls} (retry +${SHIFT_RETRY_SECS}s) at ${formatMmSs(retrySeg.offsetSecs)}`);
                  const retryMatch = await identifyAudio(retryBytes, retrySeg.offsetSecs);
                  if (retryMatch) {
                    retryHits++;
                    match = retryMatch;
                    seg = retrySeg;
                  } else {
                    retriedAndMissed = true;
                  }
                } catch (retryErr) {
                  if (retryErr instanceof AcrRateLimitError) {
                    emit({ type: "warning", message: "Daily recognition limit reached — this setlist is incomplete. Search it again tomorrow to continue." });
                    resumeFromSecs = seg.offsetSecs;
                    break;
                  }
                }
              }
            }

            let auddMatch: { artist: string; title: string } | null = null;
            if (!match && auddCalls < AUDD_MAX_CALLS_PER_SESSION) {
              auddCalls++;
              auddMatch = await identifyWithAudd(bytes);
            }

            const found = match ?? auddMatch;
            recentHits.push(!!found);
            if (found) {
              recognitions++;
              const key = normalizeTitle(found.title);
              const existing = seenTitles.get(key);
              if (existing === undefined) {
                seenTitles.set(key, collectedTracks.length);
                matches++;
                // AudD gives no score, so only ACRCloud matches can be flagged.
                const lowConfidence = match?.score != null && match.score < LOW_CONFIDENCE_SCORE;
                const t: CachedTrack = {
                  artist: found.artist,
                  title: found.title,
                  timestamp: formatMmSs(seg.offsetSecs),
                  ...(lowConfidence ? { lowConfidence: true } : {}),
                  ...(match?.label ? { label: match.label } : {}),
                };
                collectedTracks.push(t);
                emit({ type: "track", data: t });
                corroborate(collectedTracks.length - 1);
              } else if (collectedTracks[existing].lowConfidence) {
                // Heard again → no longer a likely false match.
                delete collectedTracks[existing].lowConfidence;
                emit({ type: "confirm", index: existing });
              }
              const d = stepAfterMatch(lastMatch, {
                title: found.title,
                mixOffsetSecs: seg.offsetSecs,
                playOffsetSecs: match?.playOffsetSecs,
                durationSecs: match?.durationSecs,
              });
              lastMatch = d.tracked;
              decision = d;
            } else {
              decision = stepAfterMiss(retriedAndMissed, mode);
            }
          } catch (err) {
            if (err instanceof AcrRateLimitError) {
              emit({ type: "warning", message: "Daily recognition limit reached — this setlist is incomplete. Search it again tomorrow to continue." });
              resumeFromSecs = seg.offsetSecs;
              break;
            }
            recentHits.push(false);
            decision = { step: MISS_STEP_SECS, reason: "probe error" };
          }

          targetOffset = seg.offsetSecs + decision.step;
          console.log(`[plan] next probe at ${formatMmSs(targetOffset)} (+${Math.round(decision.step)}s: ${decision.reason})`);
        }

        const hitRate = acrCalls > 0 ? Math.round((matches / acrCalls) * 100) : 0;
        console.log(
          `[extract] cost summary: ACR=${acrCalls} (primary=${acrPrimaryCalls}, retry=${acrRetryCalls}), ` +
          `AudD=${auddCalls}, matches=${matches}, recognitions=${recognitions}, probes=${probes}, retries=${acrRetryCalls}, hit-rate=${hitRate}%`
        );

        // Record ACR spend against the global daily budget regardless of outcome.
        await addAcrCalls(acrCalls).catch(() => {});

        const incomplete = resumeFromSecs !== null;
        // One charge per user per set: a user who already paid (closed the tab earlier)
        // finishes it for free. Cut-offs caused by our limits are never charged.
        const alreadyPaid = !!resume?.prepaidBy && resume.prepaidBy === userEmail;
        const charge = !alreadyPaid && (incomplete ? clientAborted && acrCalls > 0 : collectedTracks.length > 0);
        const prepaidBy = incomplete ? (charge ? userEmail : resume?.prepaidBy ?? null) : null;
        // Complete runs are saved when they found something. Cut-off runs are always saved
        // (even with 0 tracks) so the next lookup continues instead of starting over. A finished
        // resume is always saved so the old "incomplete" record is replaced.
        if (collectedTracks.length > 0 || incomplete || resume) {
          await saveSetlist({
            url: canonicalUrl,
            title: track.title,
            username: track.username,
            publishedAt: track.publishedAt,
            tracks: sortTracksByTime(collectedTracks),
            incomplete,
            resumeFromSecs,
            durationSecs: track.duration ? Math.round(track.duration / 1000) : totalDuration,
            scTrackId: track.id,
            prepaidBy,
          }, userEmail).catch(() => {});
        }
        finalTracks = collectedTracks;
        if (charge) {
          await incrementMonthlyUsage(userEmail).catch(() => {});
        }
        if (incomplete) {
          console.log(
            `[extract] incomplete (${clientAborted ? "client closed" : "limit reached"}): saved ${collectedTracks.length} tracks, ` +
              `will resume at ${formatMmSs(resumeFromSecs!)} (${charge ? "charged" : "not charged"})`
          );
        }

        emit({
          type: "done",
          total: collectedTracks.length,
          title: track.title,
          incomplete,
          resumeFromSecs,
          durationSecs: track.duration ? Math.round(track.duration / 1000) : totalDuration,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        emit({ type: "error", message: msg });
      } finally {
        tracksDone();
        close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

function cleanSoundCloudUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}
