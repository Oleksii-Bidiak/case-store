import Link from "next/link";
import { dict } from "@/shared/config";
import type { BannerEntity } from "@/shared/api/generated/models";

interface AnnouncementBarProps {
  /** ANNOUNCEMENT_BAR banner (falls back to the hardcoded message when absent). */
  banner?: BannerEntity;
}

/**
 * AnnouncementBar — the slim top strip above the header: a free-shipping /
 * same-day message on the left and the support phone on the right. The message
 * comes from the admin ANNOUNCEMENT_BAR banner when one is published; otherwise
 * the hardcoded dictionary copy renders unchanged. When the banner carries a CTA
 * href, the message becomes a link. Non-sticky: it scrolls away while the header
 * itself stays pinned.
 */
export function AnnouncementBar({ banner }: AnnouncementBarProps = {}) {
  const message = banner?.title ?? dict.header.announcement;
  const href = banner?.ctaHref ?? undefined;

  return (
    <div className="bg-footer text-footer-foreground">
      <div className="mx-auto flex h-10 max-w-7xl items-center justify-between gap-3 px-4 text-[13px]">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-success"
          />
          {href ? (
            <Link
              href={href}
              className="truncate transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-footer-foreground"
            >
              {message}
            </Link>
          ) : (
            <span className="truncate">{message}</span>
          )}
        </span>
        <a
          href={dict.header.phoneHref}
          aria-label={dict.header.phoneAria}
          className="shrink-0 font-mono font-semibold whitespace-nowrap opacity-90 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-footer-foreground"
        >
          {dict.header.phone}
        </a>
      </div>
    </div>
  );
}
