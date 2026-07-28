import { Skeleton } from "@/shared/ui";

/** Loading placeholder for the returns queue — a toolbar plus six rows. */
export function AdminReturnTableSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-48" />
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
