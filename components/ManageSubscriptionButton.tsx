"use client";

import { useState } from "react";
import { toast } from "sonner";

/** Opens the Stripe billing portal (update card, cancel subscription). */
export default function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data.error ?? "Could not open billing portal");
    } catch {
      toast.error("Could not open billing portal");
    }
    setLoading(false);
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full rounded-xl border border-orange-500 py-3 text-sm font-semibold text-orange-600 transition hover:bg-orange-50 disabled:opacity-50 dark:text-orange-400 dark:hover:bg-orange-500/10"
    >
      {loading ? "Opening..." : "Manage subscription"}
    </button>
  );
}
