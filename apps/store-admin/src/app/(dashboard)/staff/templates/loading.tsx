import { PermissionTemplatesSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/staff/templates`; mirrors the page's
 * `<Suspense>` fallback so there is no visual jump on navigation.
 */
export default function Loading() {
  return <PermissionTemplatesSkeleton />;
}
