import { dict } from "@/shared/config";

const PULSE = "bg-muted motion-safe:animate-pulse";

/** A device card's frame: the toned band, two pills, the text-link row. */
function CardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-card border-2 border-transparent bg-card shadow-card">
      <div className="flex items-center gap-3 bg-muted/60 p-4">
        <div className={`size-11 shrink-0 rounded-full ${PULSE}`} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className={`h-5 w-3/5 rounded-full ${PULSE}`} />
          <div className={`h-4 w-2/5 rounded-full ${PULSE}`} />
        </div>
      </div>
      <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-4">
        <div className="flex gap-2">
          <div className={`h-11 w-40 rounded-full ${PULSE}`} />
          <div className={`h-11 w-32 rounded-full ${PULSE}`} />
        </div>
        <div className={`h-11 w-36 rounded-full ${PULSE}`} />
      </div>
    </div>
  );
}

/**
 * What «Мої пристрої» shows until the browser's list is read (server render
 * and hydration): the settings panel, a group heading and three cards — the
 * common shape, so a shopper with devices sees no jump and nobody sees the
 * empty state flash first.
 */
export function MyDevicesSkeleton() {
  return (
    <div role="status" aria-label={dict.devicePages.manager.loadingAria}>
      <div
        aria-hidden="true"
        className="mt-6 mb-2 flex flex-col gap-3 rounded-lg bg-card px-5 py-4.5 shadow-card"
      >
        <div className={`h-5 w-2/3 rounded-full ${PULSE}`} />
        <div className={`h-4 w-5/6 rounded-full ${PULSE}`} />
        <div className="my-2 border-t border-border" />
        <div className={`h-5 w-1/2 rounded-full ${PULSE}`} />
        <div className={`h-4 w-3/4 rounded-full ${PULSE}`} />
      </div>
      <div aria-hidden="true" className="mt-7">
        <div className={`mb-3 h-7 w-32 rounded-full ${PULSE}`} />
        <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </div>
  );
}
