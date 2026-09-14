import { Suspense } from "react";
import type { Metadata } from "next";
import { MediaLibraryView, MediaLibrarySkeleton } from "@/widgets";
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

export default function MediaPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.mediaLibrary.heading}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {dict.mediaLibrary.subheading}
        </p>
      </div>

      {/* `useSearchParams()` inside the view needs a Suspense boundary. */}
      <Suspense fallback={<MediaLibrarySkeleton />}>
        <MediaLibraryView />
      </Suspense>
    </div>
  );
}
