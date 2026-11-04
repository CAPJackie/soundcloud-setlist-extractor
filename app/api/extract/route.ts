import { NextRequest } from "next/server";
import {
  fetchSoundCloudPageHtml,
  fetchSoundCloudTrack,
  extractClientId,
  resolveStreamUrl,
  getHlsTranscodings,
} from "@/lib/soundcloud";
import { parseTracklist } from "@/lib/tracklist-parser";
import { fetchM3u8Segments, findSegmentIndexNearOffset, downloadProbeBytes, INITIAL_OFFSET_SECS, SHIFT_RETRY_SECS } from "@/lib/hls-chunks";
import { identifyAudio, AcrRateLimitError, ACR_MAX_CALLS_PER_SESSION, type AcrMatch } from "@/lib/acrcloud";
import { stepAfterMatch, stepAfterMiss, isSparseMode, MISS_STEP_SECS, type TrackedMatch } from "@/lib/sampling-plan";
import { identifyWithAudd, AUDD_MAX_CALLS_PER_SESSION } from "@/lib/audd";
import { getCachedSetlist, saveSetlist, CachedTrack } from "@/lib/setlist-cache";
import { auth } from "@/auth";
import { checkAndRecordRateLimit } from "@/lib/rate-limit";
import { getQuota, incrementMonthlyUsage } from "@/lib/usage";
import { isAcrBudgetExceeded, addAcrCalls } from "@/lib/budget";

export const maxDuration = 300;

type SseEvent =
  | { type: "status"; message: string }
  | { type: "warning"; message: string }
  | { type: "resolved"; url: string }
  | { type: "track"; data: { artist: string; title: string; timestamp?: string } }
  | { type: "error"; message: string }
  | { type: "done"; total: number; cached?: boolean; title?: string };

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
        else if (event.type === "track") console.log(`[extract] track: ${event.data.artist} — ${event.data.title}${event.data.timestamp ? ` @ ${event.data.timestamp}` : ""}`);
        else if (event.type === "done") console.log(`[extract] done: ${event.total} tracks${event.cached ? " (cached)" : ""}`);
      };

      try {
        if (canonicalUrl !== url) {
          emit({ type: "resolved", url: canonicalUrl });
        }
        // --- Cache check ---
        emit({ type: "status", message: "Checking cache..." });
        const cached = await getCachedSetlist(canonicalUrl).catch(() => null);
        if (cached) {
          emit({ type: "status", message: `Found cached result from ${cached.cachedAt.toLocaleDateString()}` });
          for (const t of cached.tracks) {
            emit({ type: "track", data: t });
          }
          emit({ type: "done", total: cached.tracks.length, cached: true, title: cached.title });
          close();
          return;
        }

        // --- Cache miss: this is a real (billable) extraction. Enforce quota + global budget. ---
        const quota = await getQuota(userEmail);
        if (!quota.allowed) {
          emit({
            type: "error",
            message:
              quota.plan === "pro"
                ? `You've reached your monthly limit of ${quota.limit} extractions.`
                : `You've used all ${quota.limit} free extractions this month. Upgrade to Pro for more.`,
          });
          close();
          return;
        }
        if (await isAcrBudgetExceeded()) {
          emit({ type: "error", message: "The service is temporarily at capacity. Please try again later." });
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

        const collectedTracks: CachedTrack[] = [];

        // --- Tier 1: description parsing ---
        const parsed = parseTracklist(track.description);

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

        const seenTitles = new Set(collectedTracks.map((t) => t.title.toLowerCase()));
        const visitedUrls = new Set<string>();
        let targetOffset = INITIAL_OFFSET_SECS;
        let auddCalls = 0;
        let acrCalls = 0;
        let acrPrimaryCalls = 0;
        let acrRetryCalls = 0;
        let probes = 0;
        let matches = 0; // new tracks added
        let recognitions = 0; // any successful identification, incl. repeats of the same song
        let lastMatch: TrackedMatch | undefined;
        let sparseLogged = false;
        const formatMmSs = (secs: number) =>
          `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

        while (targetOffset <= totalDuration) {
          if (req.signal.aborted) break;
          let idx = findSegmentIndexNearOffset(allSegments, targetOffset);
          if (idx < 0) break;
          // Short steps can land on a segment a retry already used: move forward instead of stopping.
          while (idx < allSegments.length && visitedUrls.has(allSegments[idx].url)) idx++;
          if (idx >= allSegments.length) break;
          let seg = allSegments[idx];
          visitedUrls.add(seg.url);

          const minutes = Math.floor(seg.offsetSecs / 60);
          emit({ type: "status", message: `Identifying track at ~${minutes}:00...` });

          const sparse = isSparseMode(acrCalls, recognitions);
          if (sparse && !sparseLogged) {
            sparseLogged = true;
            console.log(`[plan] sparse mode: ${recognitions}/${acrCalls} recognized → no retries, wider steps`);
          }

          let decision: { step: number; reason: string };
          try {
            if (acrCalls >= ACR_MAX_CALLS_PER_SESSION) {
              emit({ type: "warning", message: `ACRCloud call limit reached (${ACR_MAX_CALLS_PER_SESSION} calls) — results may be incomplete.` });
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
            if (!match && !sparse) {
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
                    match = retryMatch;
                    seg = retrySeg;
                  } else {
                    retriedAndMissed = true;
                  }
                } catch (retryErr) {
                  if (retryErr instanceof AcrRateLimitError) {
                    emit({ type: "warning", message: "ACRCloud daily limit reached — results may be incomplete. Try again tomorrow." });
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
            if (found) {
              recognitions++;
              if (!seenTitles.has(found.title.toLowerCase())) {
                seenTitles.add(found.title.toLowerCase());
                matches++;
                const t: CachedTrack = {
                  artist: found.artist,
                  title: found.title,
                  timestamp: formatMmSs(seg.offsetSecs),
                };
                collectedTracks.push(t);
                emit({ type: "track", data: t });
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
              // In sparse mode we skip the retry on purpose, so treat a miss like a double miss.
              decision = stepAfterMiss(retriedAndMissed || sparse);
            }
          } catch (err) {
            if (err instanceof AcrRateLimitError) {
              emit({ type: "warning", message: "ACRCloud daily limit reached — results may be incomplete. Try again tomorrow." });
              break;
            }
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

        // Save to DB regardless of how many tracks we found
        if (collectedTracks.length > 0) {
          await saveSetlist({
            url: canonicalUrl,
            title: track.title,
            username: track.username,
            publishedAt: track.publishedAt,
            tracks: collectedTracks,
          }, userEmail).catch(() => {});
          await incrementMonthlyUsage(userEmail).catch(() => {});
        }

        emit({ type: "done", total: collectedTracks.length, title: track.title });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        emit({ type: "error", message: msg });
      } finally {
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
