"use client";

import { useState, useCallback } from "react";
import URLInput from "@/components/URLInput";
import TrackList from "@/components/TrackList";

interface Track {
  artist: string;
  title: string;
  timestamp?: string;
}

type SseEvent =
  | { type: "status"; message: string }
  | { type: "track"; data: Track }
  | { type: "error"; message: string }
  | { type: "done"; total: number };

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  const handleSubmit = useCallback(async (url: string) => {
    setLoading(true);
    setStatus("Starting...");
    setTracks([]);
    setError(null);
    setTotal(null);
    setCurrentUrl(url);

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
            else if (event.type === "track") setTracks((prev) => [...prev, event.data]);
            else if (event.type === "error") setError(event.message);
            else if (event.type === "done") {
              setTotal(event.total);
              setStatus("");
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

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center px-4 py-16">
      <div className="w-full max-w-2xl flex flex-col gap-10">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">&#127925;</span>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Setlist Extractor
            </h1>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Paste a SoundCloud mix URL to extract the full tracklist. Reads the description first,
            then fingerprints the audio via ACRCloud if needed.
          </p>
        </div>

        {/* Input */}
        <URLInput onSubmit={handleSubmit} loading={loading} />

        {/* Results */}
        <TrackList
          tracks={tracks}
          status={status}
          loading={loading}
          error={error}
          total={total}
          currentUrl={currentUrl}
          onCacheReset={() => { setTracks([]); setTotal(null); setStatus(""); }}
        />
      </div>
    </main>
  );
}
