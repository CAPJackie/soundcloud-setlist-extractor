import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        <Skeleton className="h-3 w-16" />

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 flex-1" />
          </div>
          <div className="flex items-center gap-3 mt-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-3 w-36 mt-1" />
        </div>

        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
            >
              <Skeleton className="h-4 w-6 shrink-0" />
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-3 w-12 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
