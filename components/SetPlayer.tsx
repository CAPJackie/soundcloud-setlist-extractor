"use client";

import { useEffect, useRef } from "react";

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
}

export default function SetPlayer({ url, tracks }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const widgetRef = useRef<SCWidget | null>(null);
  const readyRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);

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
      // API already available — init straight away
      initWidget();
      return () => { alive = false; };
    }

    // Script not ready yet — find or create the tag and wait for load
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
    // play() must come before seekTo(); give the player 200 ms to start
    w.play();
    setTimeout(() => w.seekTo(ms), 200);
  }

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

      <div className="flex flex-col gap-2">
        {tracks.map((track, i) => (
          <div
            key={`${track.title}-${i}`}
            className="flex items-center gap-4 px-5 py-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
          >
            <span className="text-xs font-mono text-zinc-400 dark:text-zinc-600 w-6 text-right shrink-0">
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
    </div>
  );
}
