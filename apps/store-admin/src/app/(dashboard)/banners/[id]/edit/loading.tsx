import { BannerFormSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/banners/[id]/edit` — the form-shaped skeleton
 * (canon 1.7); the heading is the banner's own title, unknown until it loads.
 */
export default function Loading() {
  return <BannerFormSkeleton />;
}
