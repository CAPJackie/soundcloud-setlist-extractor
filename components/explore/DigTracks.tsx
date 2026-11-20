"use client";

import Link from "next/link";
import TrackLinks from "@/components/TrackLinks";
import { useTrackLinks } from "@/lib/hooks/use-track-links";
import type { DigTrack } from "@/lib/explore-logic";

/** "Tracks to dig" rows: track + where it was heard + Spotify/Apple/Bandcamp links. */
export default function DigTracks({ tracks }: { tracks: DigTrack[] }) {
  const links = useTrackLinks(tracks, tracks.length > 0);
  return (
    <div className="flex flex-col gap-2">
      {tracks.map((t, i) => (
        <div
          key={`${t.artist}-${t.title}`}
          className="flex items-center gap-4 rounded-xl border border-zinc-100 bg-white px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t.title}
            </span>
            <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {t.artist}
              {t.label && <span className="text-zinc-400 dark:text-zinc-500"> · {t.label}</span>}
            </span>
            <Link
              href={`/sets/${t.setId}`}
              className="w-fit max-w-full truncate text-[11px] text-zinc-400 hover:text-orange-500 dark:text-zinc-500"
            >
              heard in {t.setTitle}
              {t.timestamp ? ` @ ${t.timestamp}` : ""}
            </Link>
          </div>
          <TrackLinks artist={t.artist} title={t.title} links={links[i]} />
        </div>
      ))}
    </div>
  );
}
