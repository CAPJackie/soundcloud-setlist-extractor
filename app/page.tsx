"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import URLInput from "@/components/URLInput";
import TrackList from "@/components/TrackList";

interface Track {
  artist: string;
  title: string;
  timestamp?: string;
}

type SseEvent =
  | { type: "status"; message: string }
  | { type: "warning"; message: string }
  | { type: "resolved"; url: string }
  | { type: "track"; data: Track }
  | { type: "error"; message: string }
  | { type: "done"; total: number; title?: string };

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [mixTitle, setMixTitle] = useState<string | null>(null);

  const handleSubmit = useCallback(async (url: string) => {
    setLoading(true);
    setStatus("Starting...");
    setTracks([]);
    setError(null);
    setTotal(null);
    setCurrentUrl(url);
    setMixTitle(null);

    try {
      const res = await fetch(`/api/extract?url=${encodeURIComponent(url)}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as SseEvent;
            if (event.type === "status") setStatus(event.message);
            else if (event.type === "warning") toast.error(event.message);
            else if (event.type === "resolved") setCurrentUrl(event.url);
            else if (event.type === "track") setTracks((prev) => [...prev, event.data]);
            else if (event.type === "error") setError(event.message);
            else if (event.type === "done") {
              setTotal(event.total);
              setStatus("");
              if (event.title) setMixTitle(event.title);
            }
          } catch {
            // malformed event, skip
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    const urlParam = searchParams.get("url");
    if (urlParam) {
      autoStartedRef.current = true;
      handleSubmit(urlParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl flex flex-col gap-10">
        {/* Input */}
        <URLInput onSubmit={handleSubmit} loading={loading} />

        {/* SoundCloud player */}
        {currentUrl && (
          <div className="sticky top-14 z-40 bg-zinc-50 dark:bg-zinc-950 pt-2 pb-3 shadow-[0_4px_12px_-2px] shadow-zinc-200/80 dark:shadow-zinc-950/80 -mt-6">
            <iframe
              src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(currentUrl)}&visual=true&auto_play=false&show_comments=false&hide_related=true`}
              width="100%"
              height="300"
              allow="autoplay"
              className="rounded-xl border border-zinc-100 dark:border-zinc-800 w-full"
            />
          </div>
        )}

        {/* Results */}
        <TrackList
          tracks={tracks}
          status={status}
          loading={loading}
          error={error}
          total={total}
          currentUrl={currentUrl}
          mixTitle={mixTitle}
          onCacheReset={() => { setTracks([]); setTotal(null); setStatus(""); setMixTitle(null); }}
        />
      </div>
    </main>
  );
}
