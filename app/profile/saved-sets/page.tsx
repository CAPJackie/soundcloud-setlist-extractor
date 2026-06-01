import { auth } from "@/auth";
import { getSetlistsLikedByUser } from "@/lib/setlist-cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import LikeButton from "@/components/LikeButton";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

export default async function SavedSetsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const sets = await getSetlistsLikedByUser(session.user.email);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Saved Sets</h1>

      {sets.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No saved sets yet. Click the heart icon on any set to save it here.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sets.map((set) => {
            const id = (set._id as unknown as ObjectId).toString();
            const date = new Date(
              (set.publishedAt as Date | null) ?? (set.cachedAt as Date)
            ).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });

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
                <LikeButton setlistId={id} initialLiked={true} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
