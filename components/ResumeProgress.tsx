import Link from "next/link";
import { formatClock } from "@/lib/utils";

interface Props {
  resumeFromSecs?: number | null;
  durationSecs?: number | null;
  /** Link that resumes the search (set detail page). */
  href?: string;
  /** Callback that resumes the search (home page). */
  onResume?: () => void;
  disabled?: boolean;
}

/** Amber notice for a cut-off extraction: how far it got + a "Resume search" button. */
export default function ResumeProgress({
  resumeFromSecs,
  durationSecs,
  href,
  onResume,
  disabled,
}: Props) {
  const at = resumeFromSecs ?? null;
  const total = durationSecs && durationSecs > 0 ? durationSecs : null;
  const pct = at !== null && total ? Math.min(100, Math.round((at / total) * 100)) : null;

  const where =
    at === null
      ? "The analysis stopped before the end of the mix."
      : total
        ? `Analyzed up to ${formatClock(at)} of ${formatClock(total)} (${pct}%).`
        : `Analyzed up to ${formatClock(at)}.`;

  const buttonClass =
    "shrink-0 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-4 py-2 text-xs transition";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-semibold">This setlist is incomplete</span>
          <span>{where}</span>
        </div>
        {href ? (
          <Link href={href} className={buttonClass}>
            Resume search
          </Link>
        ) : onResume ? (
          <button onClick={onResume} disabled={disabled} className={buttonClass}>
            Resume search
          </button>
        ) : null}
      </div>
      {pct !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-200/70 dark:bg-amber-500/20">
          <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
        </div>
      )}
      <span className="text-xs opacity-80">
        Resuming continues from where it stopped and keeps the tracks found so far. It uses one
        extraction from your monthly limit, unless you were already charged for this set.
      </span>
    </div>
  );
}
