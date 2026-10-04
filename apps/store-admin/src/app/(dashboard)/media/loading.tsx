import { MediaLibraryPageSkeleton } from "@/widgets/media-library-view";

/**
 * Route-level loading UI for `/media` (wave 198, МТ11); the same skeleton as
 * the page's `<Suspense>` fallback, so there is no visual jump on navigation.
 */
export default function Loading() {
  return <MediaLibraryPageSkeleton />;
}
