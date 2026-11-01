import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";

/** The one action an empty listing offers: a callback, or a way out. */
export type ListingEmptyStateAction =
  | { label: string; onClick: () => void; href?: never }
  | { label: string; href: string; onClick?: never };

export interface ListingEmptyStateProps {
  /** Decorative glyph in the muted disc — hidden from assistive tech. */
  icon: LucideIcon;
  /** The one line that says what happened. */
  heading: string;
  /** Optional helper line under it. */
  body?: string;
  /** The primary action (design-system §6) — a reset or a link out. */
  action: ListingEmptyStateAction;
  /** An outline action beside the primary one (TASK-2077 «Показати всі»). */
  secondaryAction?: ListingEmptyStateAction;
  /**
   * The icon disc surface — `bg-muted` by default; the device empty state
   * takes the active device family tone (`bg-family-*`, TASK-2077).
   */
  iconClassName?: string;
  /** Extra content under the actions (the «other devices» chips). */
  children?: ReactNode;
  className?: string;
}

function EmptyStateAction({
  action,
  variant,
}: {
  action: ListingEmptyStateAction;
  variant: "default" | "outline";
}) {
  return action.href !== undefined ? (
    <Button asChild size="lg" variant={variant} className="h-11">
      <Link href={action.href}>{action.label}</Link>
    </Button>
  ) : (
    <Button
      type="button"
      size="lg"
      variant={variant}
      className="h-11"
      onClick={action.onClick}
    >
      {action.label}
    </Button>
  );
}

/**
 * ListingEmptyState — the empty state every product listing ends in when there
 * is nothing to show (TASK-870, design-system.md §6: icon + one line + a
 * PRIMARY action). One look for `/products`, the category and compat landing
 * pages, `/promo` and `/search`; the caller decides what the action is — a
 * filter reset when something narrows the list, a link out when nothing does —
 * because only the caller knows whether a reset would do anything.
 *
 * Presentational: no data, no URL handling. The button is 44px tall (touch
 * target) and keeps the accessible name it is given verbatim.
 */
export function ListingEmptyState({
  icon: Icon,
  heading,
  body,
  action,
  secondaryAction,
  iconClassName,
  children,
  className,
}: ListingEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-border bg-card px-5 py-14 text-center shadow-card",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mb-4 inline-flex size-18 items-center justify-center rounded-full text-muted-foreground",
          iconClassName ?? "bg-muted",
        )}
      >
        <Icon className="size-8" strokeWidth={1.6} />
      </span>
      <p className="max-w-md font-display text-xl font-bold text-foreground">
        {heading}
      </p>
      {body && (
        <p className="mt-2.5 max-w-md text-sm text-muted-foreground">{body}</p>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <EmptyStateAction action={action} variant="default" />
        {secondaryAction && (
          <EmptyStateAction action={secondaryAction} variant="outline" />
        )}
      </div>
      {children}
    </div>
  );
}
