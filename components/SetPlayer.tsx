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

interface SCWidget {
  bind(event: string, fn: () => void): void;
  seekTo(ms: number): void;
  play(): void;
}

declare global {
  interface Window {
    SC?: {
      Widget: ((iframe: HTMLIFrameElement) => SCWidget) & {
        Events: { READY: string; PLAY: string; FINISH: string };
      };
    };
  }
}

function toMs(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return (parts[0] * 60 + (parts[1] ?? 0)) * 1000;
}

interface Track {
  artist: string;
  title: string;
  timestamp?: string;
}

interface Props {
  url: string;
  tracks: Track[];
  mixTitle?: string;
}

type ExportState = "idle" | "connecting" | "exporting" | "done" | "error";

export default function SetPlayer({ url, tracks, mixTitle }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const widgetRef = useRef<SCWidget | null>(null);
  const readyRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);

  const [exportState, setExportState] = useState<ExportState>("idle");
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [spotifyFoundMap, setSpotifyFoundMap] = useState<Record<number, boolean>>({});
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [foundCount, setFoundCount] = useState(0);

  useEffect(() => {
    let alive = true;

    function initWidget() {
      if (!alive || !iframeRef.current || !window.SC) return;
      const widget = window.SC.Widget(iframeRef.current);
      widgetRef.current = widget;
      widget.bind(window.SC.Widget.Events.READY, () => {
        if (!alive) return;
        readyRef.current = true;
        const pending = pendingSeekRef.current;
        if (pending !== null) {
          pendingSeekRef.current = null;
          widget.play();
          setTimeout(() => { if (alive) widget.seekTo(pending); }, 200);
        }
      });
    }

    if (window.SC) {
      initWidget();
      return () => { alive = false; };
    }

    let script = document.querySelector<HTMLScriptElement>(
      'script[src*="w.soundcloud.com/player/api"]'
    );
    if (!script) {
      script = document.createElement("script");
      script.src = "https://w.soundcloud.com/player/api.js";
      script.async = true;
      document.body.appendChild(script);
    }
    script.addEventListener("load", initWidget);

    return () => {
      alive = false;
      script!.removeEventListener("load", initWidget);
    };
  }, []);

  function handleSeek(ts: string) {
    const ms = toMs(ts);
    const w = widgetRef.current;
    if (!readyRef.current || !w) {
      pendingSeekRef.current = ms;
      return;
    }
    w.play();
    setTimeout(() => w.seekTo(ms), 200);
  }

  const copyText = () => {
    const text = tracks
      .map((t, i) => `${i + 1}. ${t.artist} - ${t.title}${t.timestamp ? ` [${t.timestamp}]` : ""}`)
      .join("\n");
    navigator.clipboard.writeText(text);
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
    const { id: playlistId, url: playlistExternalUrl } = await createPlaylist(token, playlistName);

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

    setPlaylistUrl(playlistExternalUrl);
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

  const embedUrl =
    `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}` +
    `&visual=true&auto_play=false&show_comments=false&hide_related=true`;

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-14 z-40 bg-zinc-50 dark:bg-zinc-950 pt-2 pb-3 shadow-[0_4px_12px_-2px] shadow-zinc-200/80 dark:shadow-zinc-950/80">
        <iframe
          ref={iframeRef}
          src={embedUrl}
          width="100%"
          height="300"
          allow="autoplay"
          className="rounded-xl border border-zinc-100 dark:border-zinc-800 w-full"
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {tracks.length} track{tracks.length !== 1 ? "s" : ""}
        </h2>
        <button
          onClick={copyText}
          className="text-xs text-orange-500 hover:text-orange-600 font-medium transition"
        >
          Copy all
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {tracks.map((track, i) => (
          <div
            key={`${track.title}-${i}`}
            className="flex items-center gap-4 px-5 py-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
          >
            <span className={`text-xs font-mono w-6 text-right shrink-0 ${spotifyFoundMap[i] === false ? "text-red-500 dark:text-red-400" : "text-zinc-400 dark:text-zinc-600"}`}>
              {i + 1}
            </span>

            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {track.title}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                {track.artist}
              </span>
            </div>

            {track.timestamp && (
              <button
                onClick={() => handleSeek(track.timestamp!)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-xs font-mono font-semibold transition"
              >
                <span>▶</span>
                <span>{track.timestamp}</span>
              </button>
            )}
          </div>
        ))}
      </div>

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
    </div>
  );
}
