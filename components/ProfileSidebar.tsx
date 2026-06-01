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
    <aside className="w-44 shrink-0 flex flex-col gap-1">
      {sections.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
            pathname.startsWith(s.href)
              ? "bg-orange-50 dark:bg-orange-500/10 text-orange-500"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          }`}
        >
          {s.label}
        </Link>
      ))}
    </aside>
  );
}
