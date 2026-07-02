import Link from "next/link";
import { dict } from "@/shared/config";

/**
 * AccountPlaceholderSection — a "coming soon" stub for dashboard sections with
 * no backend yet (purchases, history, compare). Shows the section title, a short
 * explanation, and a CTA to the nearest real destination.
 */
export function AccountPlaceholderSection({
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="max-w-[680px]">
      <h1 className="mb-6 font-display text-[28px] font-bold tracking-[-0.02em] text-foreground">
        {title}
      </h1>
      <div className="flex flex-col items-start gap-4 rounded-[18px] border border-border bg-card p-[26px] shadow-[var(--shadow-card)]">
        <p className="text-sm text-muted-foreground">
          {dict.account.dashboard.comingSoonTitle}
        </p>
        <p className="text-[15px] text-foreground">{body}</p>
        <Link
          href={ctaHref}
          className="inline-flex h-11 items-center rounded-[11px] bg-primary px-5 text-sm font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
