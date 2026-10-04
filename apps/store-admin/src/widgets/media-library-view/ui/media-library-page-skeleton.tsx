import { MediaLibrarySkeleton } from "@/features/media-picker";
import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Route loading UI for `/media` (wave 198, МТ11, canon 1.7): the real heading
 * and subheading, the toolbar's footprint, and card-shaped skeletons — so the
 * page does not jump when the first page of assets lands.
 *
 * Permission-blind on purpose: whether the upload button and the hint strip
 * render is decided by the session, which the server-rendered fallback does not
 * have. A placeholder for the toolbar is drawn either way.
 */
export function MediaLibraryPageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.mediaLibrary.heading}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {dict.mediaLibrary.subheading}
        </p>
      </header>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="size-9" />
      </div>
      <MediaLibrarySkeleton />
    </div>
  );
}
