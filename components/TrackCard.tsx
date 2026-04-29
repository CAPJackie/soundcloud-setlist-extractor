interface Props {
  index: number;
  artist: string;
  title: string;
  timestamp?: string;
  fresh?: boolean;
}

export default function TrackCard({ index, artist, title, timestamp, fresh }: Props) {
  return (
    <div
      className={`grid items-center gap-x-4 px-5 py-4 rounded-xl border transition-all duration-300 ${
        timestamp ? "grid-cols-[2rem_3.5rem_1fr]" : "grid-cols-[2rem_1fr]"
      } ${
        fresh
          ? "border-orange-400/60 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-500/40"
          : "border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
      }`}
    >
      <span className="text-right text-xs font-mono text-zinc-400 dark:text-zinc-600">
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
    </div>
  );
}
