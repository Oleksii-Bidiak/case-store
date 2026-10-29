"use client";

import { usePathname } from "next/navigation";
import { Eye } from "lucide-react";
import { dict } from "@/shared/config";
import { formatDayMonth, formatTime } from "@/shared/lib";

interface PreviewBarProps {
  /** ISO `expiresAt` of the preview token, when known. */
  expiresAt: string | null;
}

/** Where «Вийти з прев'ю» goes: drop the preview, stay on this page. */
export function previewExitHref(pathname: string): string {
  return `/preview/exit?to=${encodeURIComponent(pathname)}`;
}

/**
 * The signed-preview bar (TASK-669, mockup HomepageBlocks #preview).
 *
 * Pinned to the BOTTOM of the viewport: the site header is already sticky at
 * the top, and two sticky bars would eat a third of a 390px screen. Inverted
 * colours (`bg-foreground` / `text-background`) so it reads as chrome, not
 * content, in both themes. Below `md` it rides on top of a page's own fixed
 * bar (the PDP «Купити», the cart «До сплати») through the inset those bars
 * publish, instead of covering their action.
 *
 * «Вийти з прев'ю» is a plain link, not `next/link`: a prefetch of the exit
 * route would end the preview on hover, and leaving must be a full document
 * load so the next render is the public, cached page.
 *
 * Renders an in-flow spacer as well, so at the end of the scroll the bar sits
 * over empty room instead of the footer's last row.
 */
export function PreviewBar({ expiresAt }: PreviewBarProps) {
  const pathname = usePathname() || "/";
  const hint = pathname === "/" ? dict.preview.homeHint : dict.preview.pageHint;
  const until = expiresAt
    ? dict.preview.expires(
        `${formatDayMonth(expiresAt)}, ${formatTime(expiresAt)}`,
      )
    : null;

  return (
    <>
      <div aria-hidden="true" className="h-16" />
      <section
        aria-label={dict.preview.barLabel}
        data-testid="preview-bar"
        className="bottom-above-mobile-bar fixed inset-x-0 z-40 bg-foreground text-background"
      >
        <div className="mx-auto flex max-w-page items-center gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
          <Eye aria-hidden="true" className="size-4.5 shrink-0" />
          <p className="flex min-w-0 items-baseline gap-3">
            <strong className="shrink-0 font-semibold">
              {dict.preview.title}
            </strong>
            <span className="hidden truncate text-background/80 sm:inline">
              {until ? `${hint} · ${until}` : hint}
            </span>
          </p>
          <a
            href={previewExitHref(pathname)}
            className="ml-auto inline-flex h-11 shrink-0 items-center rounded-md bg-background px-3.5 font-semibold text-foreground transition-colors hover:bg-background/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background md:h-9"
          >
            {dict.preview.exit}
          </a>
        </div>
      </section>
    </>
  );
}
