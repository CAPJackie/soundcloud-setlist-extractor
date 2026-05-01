"use client";

import {
  addTracksToPlaylist,
  clearToken,
  createPlaylist,
  openSpotifyAuthPopup,
  searchTrack,
  storeToken
} from "@/lib/spotify";
import { useEffect, useRef, useState } from "react";
import TrackCard from "./TrackCard";

interface Track {
  artist: string;
  title: string;
  timestamp?: string;
}

interface Props {
  tracks: Track[];
  status: string;
  loading: boolean;
  error: string | null;
  total: number | null;
  currentUrl: string | null;
  mixTitle: string | null;
  onCacheReset: () => void;
}

type ExportState = "idle" | "connecting" | "exporting" | "done" | "error";

const isDev = process.env.NODE_ENV === "development";

export default function TrackList({ tracks, status, loading, error, total, currentUrl, mixTitle, onCacheReset }: Props) {
  const [freshIdx, setFreshIdx] = useState<number>(-1);
  const [resetting, setResetting] = useState(false);
  const prevLen = useRef(0);

  // Spotify export state
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [spotifyFoundMap, setSpotifyFoundMap] = useState<Record<number, boolean>>({});
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [foundCount, setFoundCount] = useState(0);

  useEffect(() => {
    if (tracks.length > prevLen.current) {
      setFreshIdx(tracks.length - 1);
      const t = setTimeout(() => setFreshIdx(-1), 1500);
      prevLen.current = tracks.length;
      return () => clearTimeout(t);
    }
  }, [tracks.length]);

  // Reset Spotify state when a new extraction starts
  useEffect(() => {
    if (loading) {
      setExportState("idle");
      setSpotifyFoundMap({});
      setPlaylistUrl(null);
      setExportError(null);
      setFoundCount(0);
    }
  }, [loading]);

  const copyText = () => {
    const text = tracks
      .map((t, i) => `${i + 1}. ${t.artist} - ${t.title}${t.timestamp ? ` [${t.timestamp}]` : ""}`)
      .join("\n");
    navigator.clipboard.writeText(text);
  };

  const resetCache = async () => {
    if (!currentUrl) return;
    setResetting(true);
    try {
      await fetch(`/api/cache?url=${encodeURIComponent(currentUrl)}`, { method: "DELETE" });
      onCacheReset();
    } finally {
      setResetting(false);
    }
  };

  const runExport = async (token: string) => {
    setExportState("exporting");
    setExportProgress({ current: 0, total: tracks.length });
    setSpotifyFoundMap({});
    setFoundCount(0);

    const meRes = await fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${token}` } });
    const me = await meRes.json();
    console.log("[spotify] me:", me.id, "product:", me.product, "country:", me.country);

    const playlistName = mixTitle ?? "SoundCloud Setlist";
    const { id: playlistId, url } = await createPlaylist(token, playlistName);

    const uris: string[] = [];
    const foundMap: Record<number, boolean> = {};
    let found = 0;

    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const uri = await searchTrack(token, t.artist, t.title);
      foundMap[i] = uri !== null;
      if (uri) {
        uris.push(uri);
        found++;
      }
      setSpotifyFoundMap({ ...foundMap });
      setFoundCount(found);
      setExportProgress({ current: i + 1, total: tracks.length });
    }

    if (uris.length > 0) {
      await addTracksToPlaylist(token, playlistId, uris);
    }

    setPlaylistUrl(url);
    setExportState("done");
  };

  const handleExport = async () => {
    setExportError(null);
    clearToken();

    setExportState("connecting");
    let token: string;
    try {
      token = await openSpotifyAuthPopup();
      storeToken(token);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Auth failed");
      setExportState("error");
      return;
    }

    try {
      await runExport(token);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
      setExportState("error");
    }
  };

  const doneWithNothing = !loading && tracks.length === 0 && total === 0 && !error;
  if (!loading && tracks.length === 0 && !error && total === null) return null;

  const showExportButton = tracks.length > 0 && !loading;

  return (
    <div className="w-full flex flex-col gap-4">
      {(loading || status) && (
        <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          {loading && (
            <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-orange-500 border-t-transparent animate-spin shrink-0" />
          )}
          <span className="truncate">{status}</span>
        </div>
      )}

      {doneWithNothing && (
        <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 px-5 py-4 text-sm text-zinc-500 dark:text-zinc-400">
          No tracks could be identified from this mix. ACRCloud didn't match any of the audio samples.
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-5 py-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {tracks.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {total !== null && !loading
                ? `${total} track${total !== 1 ? "s" : ""} identified`
                : `${tracks.length} track${tracks.length !== 1 ? "s" : ""} so far`}
            </h2>
            <div className="flex items-center gap-3">
              {isDev && currentUrl && !loading && (
                <button
                  onClick={resetCache}
                  disabled={resetting}
                  className="text-xs text-zinc-400 hover:text-red-500 dark:hover:text-red-400 font-medium transition disabled:opacity-40"
                  title="Reset MongoDB cache for this URL (dev only)"
                >
                  {resetting ? "Resetting..." : "Reset cache"}
                </button>
              )}
              <button
                onClick={copyText}
                className="text-xs text-orange-500 hover:text-orange-600 font-medium transition"
              >
                Copy all
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {tracks.map((track, i) => (
              <TrackCard
                key={`${track.title}-${i}`}
                index={i + 1}
                artist={track.artist}
                title={track.title}
                timestamp={track.timestamp}
                fresh={i === freshIdx}
                spotifyFound={spotifyFoundMap[i]}
              />
            ))}
          </div>

          {showExportButton && (
            <div className="flex flex-col gap-2 pt-2">
              {exportState === "idle" && (
                <button
                  onClick={handleExport}
                  className="w-full rounded-xl bg-[#1DB954] hover:bg-[#1aa34a] text-white text-sm font-semibold py-3 transition"
                >
                  Export to Spotify
                </button>
              )}

              {exportState === "connecting" && (
                <div className="flex items-center gap-2 justify-center py-3 text-sm text-zinc-500 dark:text-zinc-400">
                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-[#1DB954] border-t-transparent animate-spin shrink-0" />
                  Waiting for Spotify authorization...
                </div>
              )}

              {exportState === "exporting" && (
                <div className="flex items-center gap-2 justify-center py-3 text-sm text-zinc-500 dark:text-zinc-400">
                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-[#1DB954] border-t-transparent animate-spin shrink-0" />
                  Finding tracks... ({exportProgress.current}/{exportProgress.total})
                </div>
              )}

              {exportState === "done" && playlistUrl && (
                <div className="flex flex-col gap-2">
                  <div className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                    {foundCount} of {tracks.length} tracks found on Spotify
                    {tracks.length - foundCount > 0 && (
                      <span className="text-red-500 dark:text-red-400 ml-1">
                        ({tracks.length - foundCount} not found — shown in red)
                      </span>
                    )}
                  </div>
                  <a
                    href={playlistUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full rounded-xl bg-[#1DB954] hover:bg-[#1aa34a] text-white text-sm font-semibold py-3 transition text-center block"
                  >
                    Open Playlist on Spotify →
                  </a>
                </div>
              )}

              {exportState === "error" && (
                <div className="flex flex-col gap-2">
                  <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-5 py-3 text-sm text-red-600 dark:text-red-400">
                    {exportError}
                  </div>
                  <button
                    onClick={handleExport}
                    className="w-full rounded-xl bg-[#1DB954] hover:bg-[#1aa34a] text-white text-sm font-semibold py-3 transition"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
