"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { label: "Update Password", href: "/profile/update-password" },
  { label: "Saved Sets", href: "/profile/saved-sets" },
];

export default function ProfileSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-44 shrink-0 flex-col gap-1">
      {sections.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
            pathname.startsWith(s.href)
              ? "bg-orange-50 text-orange-500 dark:bg-orange-500/10"
              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          {s.label}
        </Link>
      ))}
    </aside>
  );
}
