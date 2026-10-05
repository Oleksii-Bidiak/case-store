import { AdminFormSkeleton, Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Route-level loading UI for `/blog/[id]/edit` (canon 1.7, wave 198): the back
 * link and a heading placeholder above the form skeleton — the frame
 * `EditBlogPostView` paints. Without it the section's own `/blog/loading.tsx`
 * (the posts register) would flash before a form.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">
          {dict.blogPosts.back}
        </span>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.blogPosts.editHeading}
        </h2>
        <Skeleton className="h-5 w-72" />
      </div>
      <AdminFormSkeleton />
    </div>
  );
}
