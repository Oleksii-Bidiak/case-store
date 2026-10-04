import { Suspense } from "react";
import type { Metadata } from "next";
// From the slice, not the `@/widgets` barrel — the barrel is one file every
// parallel lane appends to, and this page needs nothing else from it.
import {
  MediaLibraryPageSkeleton,
  MediaLibraryView,
} from "@/widgets/media-library-view";
import { dict } from "@/shared/config";

/**
 * TASK-405: this view keeps its state (`?search=`, `?page=`, `?limit=`) in the
 * query string. A statically prerendered route serves one and the same prerender
 * for every query string, so a hard load of a searched URL followed by a
 * query-only `router.replace` re-renders nothing and the controls go dead.
 * Rendering on request makes each of those a real navigation. Every admin route
 * sits behind auth, so there is no static payload worth keeping.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.mediaLibrary.metaTitle,
};

/**
 * The heading lives inside the view since wave 198: «Завантажити файли» sits
 * next to it (МТ1) and needs the upload queue the view owns. The fallback
 * draws the same heading, so nothing jumps.
 */
export default function MediaPage() {
  return (
    // `useSearchParams()` inside the view needs a Suspense boundary.
    <Suspense fallback={<MediaLibraryPageSkeleton />}>
      <MediaLibraryView />
    </Suspense>
  );
}
