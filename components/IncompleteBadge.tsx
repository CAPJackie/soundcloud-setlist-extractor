import { formatClock } from "@/lib/utils";

/** Small pill for set lists: "Incomplete · 5:00 / 1:58:00". */
export default function IncompleteBadge({
  resumeFromSecs,
  durationSecs,
}: {
  resumeFromSecs?: number | null;
  durationSecs?: number | null;
}) {
  const progress =
    resumeFromSecs != null
      ? durationSecs
        ? ` · ${formatClock(resumeFromSecs)} / ${formatClock(durationSecs)}`
        : ` · ${formatClock(resumeFromSecs)}`
      : "";
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium whitespace-nowrap text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
      Incomplete{progress}
    </span>
  );
}
