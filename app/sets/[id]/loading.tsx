import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <Skeleton className="h-3 w-16" />

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 flex-1" />
          </div>
          <div className="mt-1 flex items-center gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="mt-1 h-3 w-36" />
        </div>

        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <Skeleton className="h-4 w-6 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
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
