import { AdminReturnTableSkeleton } from "@/widgets";
import { RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Route-level loading UI for `/returns`: the page's heading plus the page's
 * `<Suspense>` fallback, so there is no visual jump on navigation (canon 1.7 —
 * a skeleton without the heading used to stand in for the page).
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader title={dict.returns.heading} />
      <AdminReturnTableSkeleton />
    </div>
  );
}
