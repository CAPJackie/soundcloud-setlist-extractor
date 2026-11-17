import TrackLinks from "./TrackLinks";
import type { TrackLinks as Links } from "@/lib/hooks/use-track-links";

interface Props {
  index: number;
  artist: string;
  title: string;
  timestamp?: string;
  fresh?: boolean;
  spotifyFound?: boolean;
  lowConfidence?: boolean;
  links?: Links;
}

export default function TrackCard({ index, artist, title, timestamp, fresh, spotifyFound, lowConfidence, links }: Props) {
  const columns = ["2rem", timestamp && "3.5rem", "1fr", lowConfidence && "auto", "auto"].filter(Boolean).join("_");
  return (
    <div
      style={{ gridTemplateColumns: columns.replace(/_/g, " ") }}
      className={`grid items-center gap-x-4 px-5 py-4 rounded-xl border transition-all duration-300 ${
        fresh
          ? "border-orange-400/60 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-500/40"
          : "border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
      }`}
    >
      <span className={`text-right text-xs font-mono ${spotifyFound === false ? "text-red-500 dark:text-red-400" : "text-zinc-400 dark:text-zinc-600"}`}>
        {index}
      </span>
      {timestamp && (
        <span className="text-xs font-mono text-orange-500 dark:text-orange-400">
          {timestamp}
        </span>
      )}
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
          {title}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{artist}</span>
      </div>
      {lowConfidence && (
        <span
          title="Recognized only once with a low score. This may be a false match."
          className="justify-self-end shrink-0 rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap"
        >
          low confidence
        </span>
      )}
      <TrackLinks artist={artist} title={title} links={links} />
    </div>
  );
}
