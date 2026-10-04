import { BlogPostTableSkeleton } from "@/widgets";
import { RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Route-level loading UI for `/blog` (BlogProposal БЛ5): the heading, the
 * section tabs' strip and the register's skeleton — the page's own layout, so
 * nothing jumps when it lands.
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
      <BlogPostTableSkeleton />
    </div>
  );
}
