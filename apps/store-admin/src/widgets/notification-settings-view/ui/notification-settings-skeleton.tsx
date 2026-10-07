import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * /settings/notifications while the channel loads: the bot card, the chats
 * card with two rows and the two buttons, and the «Що приходить» column beside
 * them — in the page's own grid, so nothing jumps when the data arrives.
 */
export function NotificationSettingsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={dict.notificationSettings.loadingAria}
      data-testid="notification-settings-skeleton"
      className="flex flex-col gap-6 lg:flex-row lg:items-start"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-full max-w-80" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-48" />
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full max-w-72" />
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Skeleton className="h-9 w-full sm:w-48" />
            <Skeleton className="h-9 w-full sm:w-44" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 lg:w-85 lg:shrink-0">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

/** The route-level fallback: the page heading over {@link NotificationSettingsSkeleton}. */
export function NotificationSettingsPageSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <NotificationSettingsHeading />
        <NotificationSettingsLead />
      </div>
      <NotificationSettingsSkeleton />
    </div>
  );
}

/** «Сповіщення» — drawn by the view, its refusal and its fallbacks. */
export function NotificationSettingsHeading() {
  return (
    <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
      {dict.notificationSettings.heading}
    </h2>
  );
}

/**
 * What the page is for. Not shown over the refusal (ДН-7.12): a session that
 * cannot open the section gets the heading and the reason, nothing else.
 */
export function NotificationSettingsLead() {
  return (
    <p className="text-sm text-muted-foreground">
      {dict.notificationSettings.subheading}
    </p>
  );
}
