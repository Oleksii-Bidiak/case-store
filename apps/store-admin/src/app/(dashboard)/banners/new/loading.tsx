import { BannerFormSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

/**
 * Route-level loading UI for `/banners/new` — the page heading over the
 * form-shaped skeleton (canon 1.7), same as the page's `<Suspense>` fallback.
 */
export default function Loading() {
  return <BannerFormSkeleton heading={dict.banners.createHeading} />;
}
