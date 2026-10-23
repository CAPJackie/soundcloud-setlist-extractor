"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Quota {
  plan: "free" | "pro";
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
}

/** Bump `refreshKey` to re-fetch usage (e.g. after an extraction completes). */
export default function UsageBanner({ refreshKey = 0 }: { refreshKey?: number }) {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/usage");
        if (active && res.ok) setQuota((await res.json()) as Quota);
      } catch {
        // ignore — banner is non-critical
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const upgrade = async () => {
    setUpgrading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data.error ?? "Could not start checkout");
    } catch {
      toast.error("Could not start checkout");
    }
    setUpgrading(false);
  };

  if (!quota) return null;

  if (quota.plan === "pro") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 px-4 py-2.5 text-sm">
        <span className="font-medium text-orange-600 dark:text-orange-400">Pro plan</span>
        <span className="text-zinc-500 dark:text-zinc-400">
          {quota.used}/{quota.limit} extractions this month
        </span>
      </div>
    );
  }

  const low = quota.remaining <= 1;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-sm">
      <span className={low ? "font-medium text-red-500 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}>
        {quota.remaining} of {quota.limit} free extractions left this month
      </span>
      <button
        onClick={upgrade}
        disabled={upgrading}
        className="rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold px-3 py-1.5 text-xs transition shrink-0"
      >
        {upgrading ? "Starting..." : "Upgrade to Pro"}
      </button>
    </div>
  );
}
