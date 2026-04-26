"use client";

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
  onCacheReset: () => void;
}

const isDev = process.env.NODE_ENV === "development";

export default function TrackList({ tracks, status, loading, error, total, currentUrl, onCacheReset }: Props) {
  const [freshIdx, setFreshIdx] = useState<number>(-1);
  const [resetting, setResetting] = useState(false);
  const prevLen = useRef(0);

  useEffect(() => {
    if (tracks.length > prevLen.current) {
      setFreshIdx(tracks.length - 1);
      const t = setTimeout(() => setFreshIdx(-1), 1500);
      prevLen.current = tracks.length;
      return () => clearTimeout(t);
    }
  }, [tracks.length]);

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

  if (!loading && tracks.length === 0 && !error) return null;

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
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
