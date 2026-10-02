import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface MobilePayBarProps {
  /** The caption above the amount — «До сплати». */
  label: string;
  /** The formatted payable amount; omitted while it is not known yet. */
  amount?: string;
  /** The page's primary action (a link or a submit button). */
  children: ReactNode;
  className?: string;
}

/**
 * MobilePayBar — the cart / checkout counterpart of the PDP `MobileAtcBar`
 * (owner decision 7.6, TASK-864). Below `md` it pins «До сплати» + the page's
 * primary action to the bottom edge. It marks itself `data-mobile-bar`, and
 * globals.css pads <body> below the footer while such a bar is mounted, so at
 * the end of the scroll nothing — not even the footer's last row — stays under it.
 *
 * From `md` up the bar dissolves (`md:contents`): its wrappers generate no box,
 * the amount hides, and the action renders exactly where it sits in the markup —
 * inside the summary card or under the form. So the page has ONE primary
 * control at every width (never a bar CTA and a summary CTA side by side), its
 * keyboard order is the reading order, and tests find a single button.
 *
 * Mind the ancestors: `position: fixed` is relative to the viewport only while
 * no ancestor sets `transform`, `filter`, `backdrop-filter` or `contain`.
 */
export function MobilePayBar({
  label,
  amount,
  children,
  className,
}: MobilePayBarProps) {
  return (
    <div
      data-testid="mobile-pay-bar"
      data-mobile-bar=""
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 md:contents",
        className,
      )}
    >
      <div className="mx-auto flex max-w-page items-center gap-3 md:contents">
        {amount !== undefined && (
          <p className="flex shrink-0 flex-col leading-tight md:hidden">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap text-foreground tabular-nums">
              {amount}
            </span>
          </p>
        )}
        <div className="flex min-w-0 flex-1 md:contents">{children}</div>
      </div>
    </div>
  );
}
