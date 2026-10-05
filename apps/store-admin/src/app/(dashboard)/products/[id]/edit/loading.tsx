import Link from "next/link";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Route-level loading UI for `/products/[id]/edit` (wave 198, TASK-1050): the
 * back link and a heading are on screen at once, so the page does not open
 * as a blank column of grey bars.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-col gap-1">
        <Link
          href="/products"
          className="self-start text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.products.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.products.editHeading}
        </h2>
      </div>
      <AdminFormSkeleton />
    </div>
  );
}
