import { AccountSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/account`: the same skeleton as the page's
 * `<Suspense>` fallback and AccountView's own loading branch. It carries the
 * dashboard's container itself, so there is no wrapper here (TASK-869).
 */
export default function Loading() {
  return <AccountSkeleton />;
}
