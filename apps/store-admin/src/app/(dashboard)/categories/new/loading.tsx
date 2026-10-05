import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Route-level loading UI for `/categories/new` (canon 1.7, wave 198): the
 * back link and the real heading above the form skeleton — the same frame
 * `CreateCategoryView` paints.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">
          {dict.categories.back}
        </span>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.categories.createHeading}
        </h2>
      </div>
      <AdminFormSkeleton />
    </div>
  );
}
