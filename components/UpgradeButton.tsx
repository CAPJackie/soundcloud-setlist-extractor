"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function UpgradeButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    if (status !== "authenticated") {
      router.push("/login");
      return;
    }
    setLoading(true);
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
    setLoading(false);
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={
        className ??
        "w-full rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-3 text-sm transition"
      }
    >
      {loading ? "Starting..." : children ?? "Upgrade to Pro"}
    </button>
  );
}
