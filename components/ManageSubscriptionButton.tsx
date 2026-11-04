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
      className="w-full rounded-xl border border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 disabled:opacity-50 font-semibold py-3 text-sm transition"
    >
      {loading ? "Opening..." : "Manage subscription"}
    </button>
  );
}
