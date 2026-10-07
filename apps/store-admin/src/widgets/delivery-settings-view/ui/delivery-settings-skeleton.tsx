import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * ДН-1.9 — /settings/delivery while the settings load: the four method cards
 * as rows (the 36 px tile, two lines, the switch pill) and the preview column
 * beside them, in the page's own grid, so nothing jumps when the form arrives.
 */
export function DeliverySettingsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={dict.deliverySettings.loadingAria}
      data-testid="delivery-settings-skeleton"
      className="flex flex-col gap-6 lg:flex-row lg:items-start"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            data-slot="delivery-card-skeleton"
            className="flex items-start gap-3 rounded-lg border bg-card p-4"
          >
            <Skeleton className="size-9 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full max-w-100" />
            </div>
            <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 lg:w-80 lg:shrink-0">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}

/** The route-level fallback: the page heading over {@link DeliverySettingsSkeleton}. */
export function DeliverySettingsPageSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <DeliverySettingsHeading />
      <DeliverySettingsSkeleton />
    </div>
  );
}

/** «Доставка» and what the page is for — drawn by the view and its fallbacks. */
export function DeliverySettingsHeading() {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        {dict.deliverySettings.heading}
      </h2>
      <p className="text-sm text-muted-foreground">
        {dict.deliverySettings.subheading}
      </p>
    </div>
  );
}
