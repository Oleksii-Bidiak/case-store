import { dict } from "@/shared/config";
import { BlogSearchIcon } from "./blog-icons";

/**
 * BlogEmptyState — shown when no post matches the active category + query.
 */
export function BlogEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[18px] border border-border bg-card px-5 py-16 text-center shadow-card">
      <span className="mb-4 inline-flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <BlogSearchIcon width={30} height={30} strokeWidth={1.6} />
      </span>
      <b className="font-display text-[19px] text-foreground">
        {dict.blog.emptyHeading}
      </b>
      <p className="mt-2 max-w-[360px] text-sm text-muted-foreground">
        {dict.blog.emptyBody}
      </p>
    </div>
  );
}
