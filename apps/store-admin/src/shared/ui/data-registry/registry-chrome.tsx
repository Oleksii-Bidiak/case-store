"use client";

import * as React from "react";
import { XIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { formatTime } from "@/shared/lib/format";
import { dict } from "@/shared/config";
import { Button } from "../button";

const r = dict.common.registry;

/* ── Header ─────────────────────────────────────────────────────────────── */

export interface RegistryHeaderProps {
  title: string;
  /** One muted line under the title. */
  description?: React.ReactNode;
  /** Right side: export menu, then the primary CTA. The caller gates the CTA. */
  actions?: React.ReactNode;
  className?: string;
}

/** Title (Sora 24/32) on the left, the screen's actions on the right. */
export function RegistryHeader({
  title,
  description,
  actions,
  className,
}: RegistryHeaderProps) {
  return (
    <div
      data-slot="registry-header"
      className={cn(
        "flex flex-wrap items-start justify-between gap-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/* ── Quick views ────────────────────────────────────────────────────────── */

export interface QuickView {
  id: string;
  label: string;
  /** Optional — omit rather than show a number the API does not give. */
  count?: number;
}

export interface QuickViewsProps {
  items: readonly QuickView[];
  activeId: string;
  /** URL-driven by the caller. */
  onChange: (id: string) => void;
  className?: string;
  /**
   * Ties the tabs to the list they filter: each tab gets the id
   * `quickViewTabId(idPrefix, view)` and `aria-controls={panelId}`. Without it
   * the tabs promise a panel nobody can find.
   */
  panel?: { idPrefix: string; panelId: string };
}

export const quickViewTabId = (idPrefix: string, viewId: string) =>
  `${idPrefix}-view-${viewId}`;

/**
 * Preset views as pills. A `tablist` with roving focus: Tab lands on the
 * active view only, arrows move between views, Enter/Space picks one — the
 * pick navigates (it rewrites the URL), so it is not done on a mere arrow.
 */
export function QuickViews({
  items,
  activeId,
  onChange,
  className,
  panel,
}: QuickViewsProps) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  // A deep link can select something no view matches (`?status=DELIVERED`).
  // Roving focus still needs one tab in the Tab order, or the views become
  // unreachable from the keyboard — the first one stands in.
  const anyActive = items.some((item) => item.id === activeId);

  const focusAt = (index: number) => {
    const count = items.length;
    refs.current[(index + count) % count]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={r.quickViewsLabel}
      data-slot="registry-quick-views"
      className={cn("-mx-1 flex gap-2 overflow-x-auto px-1 pb-1", className)}
    >
      {items.map((item, index) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={panel ? quickViewTabId(panel.idPrefix, item.id) : undefined}
            aria-controls={panel?.panelId}
            aria-selected={active}
            tabIndex={active || (!anyActive && index === 0) ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") focusAt(index + 1);
              else if (event.key === "ArrowLeft") focusAt(index - 1);
              else if (event.key === "Home") focusAt(0);
              else if (event.key === "End") focusAt(items.length - 1);
              else return;
              event.preventDefault();
            }}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-background px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              active &&
                "border-primary bg-primary/10 text-primary hover:text-primary",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "inline-flex min-w-5 justify-center rounded-full px-1.5 text-xs leading-4.5 tabular-nums",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {item.count.toLocaleString("uk-UA")}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ── Applied-filter chips ───────────────────────────────────────────────── */

export interface FilterChip {
  key: string;
  /** «Спосіб оплати: Післяплата» */
  label: string;
  onRemove: () => void;
}

export interface FilterChipsProps {
  chips: readonly FilterChip[];
  onClearAll?: () => void;
  disabled?: boolean;
  className?: string;
}

/** One chip per applied filter, plus «Скинути все». Nothing when empty. */
export function FilterChips({
  chips,
  onClearAll,
  disabled = false,
  className,
}: FilterChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div
      data-slot="registry-filter-chips"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {chips.map((chip) => (
        <Button
          key={chip.key}
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={chip.onRemove}
          aria-label={r.removeChipAria(chip.label)}
        >
          <span>{chip.label}</span>
          <XIcon aria-hidden="true" className="size-3.5" />
        </Button>
      ))}
      {onClearAll ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onClearAll}
        >
          {r.clearAll}
        </Button>
      ) : null}
    </div>
  );
}

/* ── Summary row ────────────────────────────────────────────────────────── */

export interface RegistrySummaryProps {
  /** «Знайдено **27 замовлень** · на суму **214 380 ₴»** — use {@link SummaryValue}. */
  children?: React.ReactNode;
  /** «створено, нові зверху» */
  sortLabel?: string;
  /** When the data on screen was fetched — `dataUpdatedAt` of the query. */
  updatedAt?: Date | number;
  className?: string;
}

/** The emphasised number inside a summary line. */
export function SummaryValue({ children }: { children: React.ReactNode }) {
  return (
    <b className="font-semibold text-foreground tabular-nums">{children}</b>
  );
}

export function RegistrySummary({
  children,
  sortLabel,
  updatedAt,
  className,
}: RegistrySummaryProps) {
  const hint = [
    sortLabel ? r.summarySort(sortLabel) : null,
    updatedAt !== undefined ? r.summaryUpdated(formatTime(updatedAt)) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (!children && !hint) return null;
  return (
    <div
      data-slot="registry-summary"
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-2 text-sm text-muted-foreground",
        className,
      )}
    >
      <p>{children}</p>
      {hint ? <p className="text-xs">{hint}</p> : null}
    </div>
  );
}
