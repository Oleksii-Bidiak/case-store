import { BlogCategoryTableSkeleton } from "@/widgets";
import { RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Route-level loading UI for `/blog/categories` (canon 1.7): the section
 * heading and the grid's skeleton. Without it the section's own
 * `/blog/loading.tsx` (the posts register) would flash before the categories.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader title={dict.blogPosts.heading} />
      <div
        aria-hidden="true"
        className="flex h-10 items-end gap-4 border-b border-border px-3"
      >
        <div className="mb-2 h-4 w-20 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
        <div className="mb-2 h-4 w-24 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
      </div>
      <BlogCategoryTableSkeleton />
    </div>
  );
}
