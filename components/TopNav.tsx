"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition, useState } from "react";
import { signOut } from "next-auth/react";

const tabs = [
  { label: "Search", href: "/" },
  { label: "Sets", href: "/sets" },
  { label: "My Sets", href: "/my-sets" },
  { label: "Explore", href: "/explore" },
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
    <nav
      className={`fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-1 border-b border-zinc-200 bg-white/80 px-4 backdrop-blur transition-opacity dark:border-zinc-800 dark:bg-zinc-900/80 ${isPending ? "opacity-75" : "opacity-100"}`}
    >
      <span className="mr-3 text-lg select-none">&#127925;</span>
      <span className="mr-4 hidden text-sm font-semibold text-zinc-900 sm:block dark:text-zinc-50">
        Setlist Extractor
      </span>
      {tabs.map((tab) => (
        <button
          key={tab.href}
          onClick={() => navigate(tab.href)}
          onMouseEnter={() => router.prefetch(tab.href)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            isActive(tab.href)
              ? "bg-orange-50 text-orange-500 dark:bg-orange-500/10"
              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          {tab.label}
        </button>
      ))}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="ml-auto text-xs text-zinc-400 transition hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        Sign out
      </button>
    </nav>
  );
}
