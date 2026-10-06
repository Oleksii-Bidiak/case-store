import { DeliverySettingsPageSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/settings/delivery` (TASK-644, ДН-1.9). The page
 * heading over the four card rows and the preview column — the same fallback as
 * the page's `<Suspense>`, so there is no visual jump on navigation and no
 * borrowed dashboard skeleton (TASK-1053's lesson on /settings/search).
 */
export default function Loading() {
  return <DeliverySettingsPageSkeleton />;
}
