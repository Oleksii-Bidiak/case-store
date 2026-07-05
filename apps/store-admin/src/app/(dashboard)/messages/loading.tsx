import { MessageInboxSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/messages`; mirrors the page's `<Suspense>`
 * fallback so there is no visual jump on navigation.
 */
export default function Loading() {
  return <MessageInboxSkeleton />;
}
