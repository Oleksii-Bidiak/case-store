import { dict } from "@/shared/config";

/**
 * AnnouncementBar — the slim top strip above the header: a free-shipping /
 * same-day message on the left and the support phone on the right. Static copy
 * from the dictionary (city/language/currency selectors are intentionally out of
 * scope for now — TASK-167-A). Non-sticky: it scrolls away while the header
 * itself stays pinned. Server Component.
 */
export function AnnouncementBar() {
  return (
    <div className="bg-foreground text-background">
      <div className="mx-auto flex h-10 max-w-7xl items-center justify-between gap-3 px-4 text-[13px]">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-success"
          />
          <span className="truncate">{dict.header.announcement}</span>
        </span>
        <a
          href={dict.header.phoneHref}
          aria-label={dict.header.phoneAria}
          className="shrink-0 font-mono font-semibold whitespace-nowrap opacity-90 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-background"
        >
          {dict.header.phone}
        </a>
      </div>
    </div>
  );
}
