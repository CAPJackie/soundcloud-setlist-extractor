import { getAllSetlists } from "@/lib/setlist-cache";
import { auth } from "@/auth";
import Link from "next/link";
import LikeButton from "@/components/LikeButton";
import { ObjectId } from "mongodb";

export default async function SetsPage() {
  const [sets, session] = await Promise.all([getAllSetlists(), auth()]);
  const userEmail = session?.user?.email ?? null;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">All Sets</h1>
        <div className="flex flex-col gap-2">
          {sets.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No sets cached yet.</p>
          )}
          {sets.map((set) => {
            const id = (set._id as unknown as ObjectId).toString();
            const date = new Date(
              (set.publishedAt as Date | null) ?? (set.cachedAt as Date)
            ).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            const isLiked = userEmail
              ? ((set.likedBy as string[] | undefined) ?? []).includes(userEmail)
              : false;

            return (
              <div key={id} className="flex items-center gap-2">
                <Link
                  href={`/sets/${id}`}
                  className="flex-1 flex items-center justify-between gap-4 px-5 py-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-orange-400/60 transition group min-w-0"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-orange-500 transition">
                      {set.title as string}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {set.username as string}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                    <span>{set.trackCount as number} tracks</span>
                    <span>{date}</span>
                  </div>
                </Link>
                {userEmail && <LikeButton setlistId={id} initialLiked={isLiked} />}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
