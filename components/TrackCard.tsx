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
      className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-all duration-300 ${
        fresh
          ? "border-orange-400/60 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-500/40"
          : "border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
      }`}
    >
      <span className="w-8 text-right text-xs font-mono text-zinc-400 dark:text-zinc-600 shrink-0">
        {index}
      </span>
      {timestamp && (
        <span className="text-xs font-mono text-orange-500 dark:text-orange-400 shrink-0 w-12">
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
