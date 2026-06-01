"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition, useState } from "react";
import { signOut } from "next-auth/react";

const tabs = [
  { label: "Search", href: "/" },
  { label: "Sets", href: "/sets" },
  { label: "My Sets", href: "/my-sets" },
  { label: "Profile", href: "/profile" },
];

export default function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const activeHref = isPending && pendingHref ? pendingHref : pathname;
  const isActive = (href: string) =>
    href === "/" ? activeHref === "/" : activeHref.startsWith(href);

  function navigate(href: string) {
    if (href === pathname) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <nav className={`fixed top-0 inset-x-0 z-50 h-14 bg-white/80 dark:bg-zinc-900/80 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 gap-1 transition-opacity ${isPending ? "opacity-75" : "opacity-100"}`}>
      <span className="text-lg mr-3 select-none">&#127925;</span>
      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mr-4 hidden sm:block">
        Setlist Extractor
      </span>
      {tabs.map((tab) => (
        <button
          key={tab.href}
          onClick={() => navigate(tab.href)}
          onMouseEnter={() => router.prefetch(tab.href)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
            isActive(tab.href)
              ? "text-orange-500 bg-orange-50 dark:bg-orange-500/10"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          }`}
        >
          {tab.label}
        </button>
      ))}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="ml-auto text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
      >
        Sign out
      </button>
    </nav>
  );
}
