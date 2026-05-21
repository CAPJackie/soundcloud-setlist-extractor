import { getSetlistById } from "@/lib/setlist-cache";
import { notFound } from "next/navigation";
import Link from "next/link";
import TrackCard from "@/components/TrackCard";

export default async function SetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const set = await getSetlistById(id);
  if (!set) notFound();

  const date = new Date(set.publishedAt ?? set.cachedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        <Link
          href="/sets"
          className="text-xs text-zinc-400 hover:text-orange-500 transition w-fit"
        >
          ← All Sets
        </Link>

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{set.title}</h1>
          <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span>{set.username}</span>
            <span>·</span>
            <span>{set.tracks.length} tracks</span>
            <span>·</span>
            <span>{date}</span>
          </div>
          <a
            href={set.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-orange-500 hover:text-orange-400 transition w-fit mt-1"
          >
            Open on SoundCloud →
          </a>
        </div>

        <div className="flex flex-col gap-2">
          {set.tracks.map((track, i) => (
            <TrackCard
              key={`${track.title}-${i}`}
              index={i + 1}
              artist={track.artist}
              title={track.title}
              timestamp={track.timestamp}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
