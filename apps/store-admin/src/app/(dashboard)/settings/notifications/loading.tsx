import { NotificationSettingsPageSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/settings/notifications` (TASK-676). The page
 * heading over the bot card, the chats card and the «Що приходить» column —
 * the same fallback as the page's `<Suspense>`, so nothing jumps on navigation.
 */
export default function Loading() {
  return <NotificationSettingsPageSkeleton />;
}
