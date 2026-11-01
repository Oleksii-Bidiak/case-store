import Link from "next/link";
import { dict, H1_CLASS } from "@/shared/config";

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
      <h1 className={`mb-6 ${H1_CLASS} text-foreground`}>{title}</h1>
      <div className="flex flex-col items-start gap-4 rounded-card border border-border bg-card p-[26px] shadow-card">
        <p className="text-sm text-muted-foreground">
          {dict.account.dashboard.comingSoonTitle}
        </p>
        <p className="text-[15px] text-foreground">{body}</p>
        <Link
          href={ctaHref}
          className="inline-flex h-11 items-center rounded-menu bg-primary px-5 text-sm font-semibold text-primary-foreground no-underline transition-interactive hover:bg-primary-hover hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring active:scale-98 active:bg-primary active:shadow-none motion-reduce:active:scale-100"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
