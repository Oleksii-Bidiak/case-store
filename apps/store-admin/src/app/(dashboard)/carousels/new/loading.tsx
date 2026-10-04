import { CarouselFormSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

/**
 * Route-level loading UI for `/carousels/new` — the page heading over the
 * form-shaped skeleton (canon 1.7), same as the page's `<Suspense>` fallback.
 */
export default function Loading() {
  return <CarouselFormSkeleton heading={dict.carousels.createHeading} />;
}
