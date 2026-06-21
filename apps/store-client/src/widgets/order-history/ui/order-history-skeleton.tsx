import { Skeleton } from "@/shared/ui";

/** Loading placeholder for the order-history list. */
export function OrderHistorySkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Skeleton className="h-9 w-48" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
