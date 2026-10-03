import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/shared/ui";

export interface BlogEmptyStateProps {
  /** Decorative glyph in the muted disc — hidden from assistive tech. */
  icon: LucideIcon;
  /** The one line that says what happened. */
  heading: string;
  /** Helper line under it. */
  body: string;
  /** The primary action (design-system §6): always a way on, never a dead end. */
  action: { label: string; href: string };
}

/**
 * BlogEmptyState — the journal hub with nothing to show (TASK-870,
 * design-system §6: icon + one line + a PRIMARY action). The same card as the
 * catalogue's `ListingEmptyState` (muted disc, display line, muted helper,
 * 44 px primary); a widget cannot import another widget, so the content hubs
 * keep a lane-local copy until the pattern is lifted into `shared/ui`.
 *
 * `BlogView` picks the copy and the action: a filter or a search that found
 * nothing, a page past the end, or a journal with no articles yet.
 */
export function BlogEmptyState({
  icon: Icon,
  heading,
  body,
  action,
}: BlogEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-border bg-card px-5 py-14 text-center shadow-card">
      <span
        aria-hidden="true"
        className="mb-4 inline-flex size-18 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <Icon className="size-8" strokeWidth={1.6} />
      </span>
      <p className="max-w-md font-display text-xl font-bold text-foreground">
        {heading}
      </p>
      <p className="mt-2.5 max-w-md text-sm text-muted-foreground">{body}</p>
      <Button asChild size="lg" className="mt-5 h-11">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    </div>
  );
}
