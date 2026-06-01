import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl flex gap-8">
        <div className="flex flex-col gap-2 w-40 shrink-0">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        <div className="flex-1 flex flex-col gap-4">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
    </div>
  );
}
