import { Skeleton } from "./skeleton";

interface AdminFormSkeletonProps {
  /** Number of skeleton field rows to render. */
  rows?: number;
}

/**
 * AdminFormSkeleton — loading placeholder for the admin create/edit form views.
 * Renders a column of full-width field rows; replaces the byte-for-byte
 * identical inline skeletons previously duplicated across the edit views.
 */
export function AdminFormSkeleton({ rows = 6 }: AdminFormSkeletonProps) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}
