import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <Skeleton className="h-7 w-24" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border border-zinc-100 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-28" />
              </div>
              <div className="flex gap-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
