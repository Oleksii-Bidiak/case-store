import { AccountProfileSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/account`. It renders inside the account layout
 * — the frame (container, back link, menu, chip strip) is already AccountShell
 * — so this is the content column only: the same profile skeleton as the
 * page's `<Suspense>` fallback and AccountView's own loading branch (TASK-869,
 * TASK-217).
 */
export default function Loading() {
  return <AccountProfileSkeleton />;
}
