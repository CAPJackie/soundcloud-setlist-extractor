import { NextRequest } from "next/server";
import {
  fetchSoundCloudPageHtml,
  fetchSoundCloudTrack,
  extractClientId,
  resolveStreamUrl,
  getHlsTranscodings,
} from "@/lib/soundcloud";
import { parseTracklist } from "@/lib/tracklist-parser";
import { fetchM3u8Segments, sampleSegments, downloadSegmentBytes, SAMPLE_INTERVAL_SECS } from "@/lib/hls-chunks";
import { identifyAudio } from "@/lib/acrcloud";
import { getCachedSetlist, saveSetlist, CachedTrack } from "@/lib/setlist-cache";

export const maxDuration = 300;

type SseEvent =
  | { type: "status"; message: string }
  | { type: "track"; data: { artist: string; title: string; timestamp?: string } }
  | { type: "error"; message: string }
  | { type: "done"; total: number; cached?: boolean };

function encode(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new Response("Missing url param", { status: 400 });

  if (!url.startsWith("https://soundcloud.com/")) {
    return new Response(
      encode({ type: "error", message: "Please enter a valid SoundCloud URL" }),
      { headers: sseHeaders() }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const close = () => { if (!closed) { closed = true; controller.close(); } };
      const emit = (event: SseEvent) => { if (!closed) controller.enqueue(encode(event)); };

      try {
        // --- Cache check ---
        emit({ type: "status", message: "Checking cache..." });
        const cached = await getCachedSetlist(url).catch(() => null);
        if (cached) {
          emit({ type: "status", message: `Found cached result from ${cached.cachedAt.toLocaleDateString()}` });
          for (const t of cached.tracks) {
            emit({ type: "track", data: t });
          }
          emit({ type: "done", total: cached.tracks.length, cached: true });
          close();
          return;
        }

        // --- Fetch SoundCloud page ---
        emit({ type: "status", message: "Fetching SoundCloud page..." });
        const [html, track] = await Promise.all([
          fetchSoundCloudPageHtml(url),
          fetchSoundCloudTrack(url),
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
            url,
            title: track.title,
            username: track.username,
            publishedAt: track.publishedAt,
            tracks: collectedTracks,
          }).catch(() => {});
          emit({ type: "done", total: collectedTracks.length });
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
        const sampled = sampleSegments(allSegments, SAMPLE_INTERVAL_SECS);

        emit({ type: "status", message: `Analyzing ${sampled.length} audio samples across the set...` });

        const seenTitles = new Set(collectedTracks.map((t) => t.title.toLowerCase()));

        for (let i = 0; i < sampled.length; i++) {
          const seg = sampled[i];
          const minutes = Math.floor(seg.offsetSecs / 60);
          emit({ type: "status", message: `Identifying track at ~${minutes}:00 (${i + 1}/${sampled.length})...` });

          try {
            const bytes = await downloadSegmentBytes(seg.url);
            const match = await identifyAudio(bytes, seg.offsetSecs);

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
            }
          } catch {
            // Skip failed segment silently
          }
        }

        // Save to DB regardless of how many tracks we found
        if (collectedTracks.length > 0) {
          await saveSetlist({
            url,
            title: track.title,
            username: track.username,
            publishedAt: track.publishedAt,
            tracks: collectedTracks,
          }).catch(() => {});
        }

        emit({ type: "done", total: collectedTracks.length });
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

function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}
