import { auth } from "@/auth";
import { getSetlistsByUser } from "@/lib/setlist-cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import LikeButton from "@/components/LikeButton";
import IncompleteBadge from "@/components/IncompleteBadge";
import { ObjectId } from "mongodb";

export default async function MySetsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const sets = await getSetlistsByUser(session.user.email);
  const userEmail = session.user.email;

  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">My Sets</h1>
        {sets.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            You haven&apos;t searched any sets yet. Go to{" "}
            <Link href="/" className="text-orange-500 hover:text-orange-400">
              Search
            </Link>{" "}
            to extract one.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {sets.map((set) => {
              const id = (set._id as unknown as ObjectId).toString();
              const date = new Date(
                (set.publishedAt as Date | null) ?? (set.cachedAt as Date),
              ).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              });
              const isLiked = ((set.likedBy as string[] | undefined) ?? []).includes(userEmail);

              return (
                <div key={id} className="flex items-center gap-2">
                  <Link
                    href={`/sets/${id}`}
                    className="group flex min-w-0 flex-1 items-center justify-between gap-4 rounded-xl border border-zinc-100 bg-white px-5 py-4 transition hover:border-orange-400/60 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold text-zinc-900 transition group-hover:text-orange-500 dark:text-zinc-100">
                        {set.title as string}
                      </span>
                      <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {set.username as string}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-xs text-zinc-400 dark:text-zinc-500">
                      {Boolean(set.incomplete) && (
                        <IncompleteBadge
                          resumeFromSecs={set.resumeFromSecs as number | null | undefined}
                          durationSecs={set.durationSecs as number | null | undefined}
                        />
                      )}
                      <span>{set.trackCount as number} tracks</span>
                      <span>{date}</span>
                    </div>
                  </Link>
                  <LikeButton setlistId={id} initialLiked={isLiked} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
