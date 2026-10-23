import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800 py-6 px-4">
      <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-400 dark:text-zinc-600">
        <span>Not affiliated with SoundCloud.</span>
        <Link href="/pricing" className="hover:text-zinc-600 dark:hover:text-zinc-300">Pricing</Link>
        <Link href="/terms" className="hover:text-zinc-600 dark:hover:text-zinc-300">Terms</Link>
        <Link href="/privacy" className="hover:text-zinc-600 dark:hover:text-zinc-300">Privacy</Link>
      </div>
    </footer>
  );
}
