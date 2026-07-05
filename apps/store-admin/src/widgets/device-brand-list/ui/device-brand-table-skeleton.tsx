import { Skeleton } from "@/shared/ui";

/** Loading skeleton for the admin device-brand table. */
export function DeviceBrandTableSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-md" />
      ))}
    </div>
  );
}
