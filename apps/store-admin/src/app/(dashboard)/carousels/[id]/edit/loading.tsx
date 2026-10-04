import { CarouselFormSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/carousels/[id]/edit` — the form-shaped skeleton
 * (canon 1.7); the heading is the carousel's own title, unknown until it loads.
 */
export default function Loading() {
  return <CarouselFormSkeleton />;
}
