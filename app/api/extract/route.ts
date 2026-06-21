import { NextRequest } from "next/server";
import {
  fetchSoundCloudPageHtml,
  fetchSoundCloudTrack,
  extractClientId,
  resolveStreamUrl,
  getHlsTranscodings,
} from "@/lib/soundcloud";
import { parseTracklist } from "@/lib/tracklist-parser";
import { fetchM3u8Segments, findSegmentIndexNearOffset, downloadProbeBytes, INITIAL_OFFSET_SECS, TRACK_ESTIMATE_SECS, FALLBACK_STEP_SECS, SHIFT_RETRY_SECS } from "@/lib/hls-chunks";
import { identifyAudio, AcrRateLimitError, ACR_MAX_CALLS_PER_SESSION } from "@/lib/acrcloud";
import { identifyWithAudd, AUDD_MAX_CALLS_PER_SESSION } from "@/lib/audd";
import { getCachedSetlist, saveSetlist, CachedTrack } from "@/lib/setlist-cache";
import { auth } from "@/auth";

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

        while (targetOffset <= totalDuration) {
          if (req.signal.aborted) break;
          const idx = findSegmentIndexNearOffset(allSegments, targetOffset);
          if (idx < 0) break;
          let seg = allSegments[idx];
          if (visitedUrls.has(seg.url)) break;
          visitedUrls.add(seg.url);

          const minutes = Math.floor(seg.offsetSecs / 60);
          emit({ type: "status", message: `Identifying track at ~${minutes}:00...` });

          try {
            if (acrCalls >= ACR_MAX_CALLS_PER_SESSION) {
              emit({ type: "warning", message: `ACRCloud call limit reached (${ACR_MAX_CALLS_PER_SESSION} calls) — results may be incomplete.` });
              break;
            }
            const bytes = await downloadProbeBytes(allSegments, idx);
            acrCalls++;
            let match: { artist: string; title: string } | null = await identifyAudio(bytes, seg.offsetSecs);

            // Retry-with-shift: if ACR missed, probe again ~25s later before giving up
            if (!match) {
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
                  const retryMatch = await identifyAudio(retryBytes, retrySeg.offsetSecs);
                  if (retryMatch) {
                    match = retryMatch;
                    seg = retrySeg;
                  }
                } catch (retryErr) {
                  if (retryErr instanceof AcrRateLimitError) {
                    emit({ type: "warning", message: "ACRCloud daily limit reached — results may be incomplete. Try again tomorrow." });
                    break;
                  }
                }
              }
            }

            if (!match && auddCalls < AUDD_MAX_CALLS_PER_SESSION) {
              auddCalls++;
              match = await identifyWithAudd(bytes);
            }

            if (match && !seenTitles.has(match.title.toLowerCase())) {
              seenTitles.add(match.title.toLowerCase());
              const mm = String(Math.floor(seg.offsetSecs / 60)).padStart(2, "0");
              const ss = String(Math.floor(seg.offsetSecs % 60)).padStart(2, "0");
              const t: CachedTrack = {
                artist: match.artist,
                title: match.title,
                timestamp: `${mm}:${ss}`,
              };
              collectedTracks.push(t);
              emit({ type: "track", data: t });
              targetOffset = seg.offsetSecs + TRACK_ESTIMATE_SECS;
            } else {
              targetOffset = seg.offsetSecs + FALLBACK_STEP_SECS;
            }
          } catch (err) {
            if (err instanceof AcrRateLimitError) {
              emit({ type: "warning", message: "ACRCloud daily limit reached — results may be incomplete. Try again tomorrow." });
              break;
            }
            targetOffset = seg.offsetSecs + FALLBACK_STEP_SECS;
          }
        }

        // Save to DB regardless of how many tracks we found
        if (collectedTracks.length > 0) {
          await saveSetlist({
            url: canonicalUrl,
            title: track.title,
            username: track.username,
            publishedAt: track.publishedAt,
            tracks: collectedTracks,
          }, userEmail).catch(() => {});
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
