"use client";

import { useEffect, useState } from "react";

export interface PlatformLink {
  url: string;
  direct: boolean;
}
export interface TrackLinks {
  spotify: PlatformLink;
  apple: PlatformLink;
}

/** Search links, available instantly; replaced by direct links once the server finds them. */
export function searchLinks(artist: string, title: string): TrackLinks {
  const q = encodeURIComponent(`${artist} ${title}`);
  return {
    spotify: { url: `https://open.spotify.com/search/${q}`, direct: false },
    apple: { url: `https://music.apple.com/search?term=${q}`, direct: false },
  };
}

/**
 * Direct Spotify / Apple Music links for each track (by index). Only fetched when
 * `enabled` (i.e. the list is final, not while an extraction is still streaming).
 */
export function useTrackLinks(tracks: { artist: string; title: string }[], enabled: boolean): (TrackLinks | undefined)[] {
  const [result, setResult] = useState<{ key: string; links: TrackLinks[] } | null>(null);
  const key = tracks.map((t) => `${t.artist}|${t.title}`).join("\n");

  useEffect(() => {
    if (!enabled || tracks.length === 0) return;
    let cancelled = false;
    fetch("/api/track-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracks: tracks.slice(0, 100).map((t) => ({ artist: t.artist, title: t.title })) }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { links?: TrackLinks[] } | null) => {
        if (!cancelled && data?.links) setResult({ key, links: data.links });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // `key` captures the track list; `tracks` itself changes identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return result?.key === key ? result.links : [];
}
