import { getSetlistById } from "@/lib/setlist-cache";
import { auth } from "@/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import LikeButton from "@/components/LikeButton";
import SetPlayer from "@/components/SetPlayer";
import ResumeProgress from "@/components/ResumeProgress";

export default async function SetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [set, session] = await Promise.all([getSetlistById(id), auth()]);
  if (!set) notFound();

  const userEmail = session?.user?.email ?? null;
  const isLiked = userEmail ? (set.likedBy ?? []).includes(userEmail) : false;

  const date = new Date(set.publishedAt ?? set.cachedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <Link href="/sets" className="w-fit text-xs text-zinc-400 transition hover:text-orange-500">
          ← All Sets
        </Link>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 flex-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">
              {set.title}
            </h1>
            {userEmail && <LikeButton setlistId={id} initialLiked={isLiked} />}
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span>{set.username}</span>
            <span>·</span>
            <span>{set.tracks.length} tracks</span>
            <span>·</span>
            <span>{date}</span>
          </div>
        </div>

        {set.incomplete && (
          <ResumeProgress
            resumeFromSecs={set.resumeFromSecs}
            durationSecs={set.durationSecs}
            href={userEmail ? `/?url=${encodeURIComponent(set.url)}` : "/login"}
          />
        )}

        <SetPlayer url={set.url} tracks={set.tracks} mixTitle={set.title} />
      </div>
    </main>
  );
}
