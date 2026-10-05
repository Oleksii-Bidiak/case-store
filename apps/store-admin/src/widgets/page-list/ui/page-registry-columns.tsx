"use client";

import { ClockIcon, ExternalLinkIcon } from "lucide-react";
import { PageEntityKind, type PageEntity } from "@/entities/page";
import { Badge, type RegistryColumn } from "@/shared/ui";
import { formatDate, formatDateTime, formatTime } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import { dict, pageSitePath, STOREFRONT_URL } from "@/shared/config";
import { isInlinedOnInfoHub } from "@/shared/config/hub-pages";

const d = dict.pages;

/**
 * Width budget of the default columns at 1440 (wave 198 canon): the 1136 px
 * content area minus the «⋯» column (44) and the border (2). No checkbox
 * column — the list has no bulk actions. The drag handle sits INSIDE the title
 * cell, so it is part of the title's width.
 */
export const PAGE_COLUMNS_WIDTH_BUDGET = 1136 - 44 - 2;

/** Plain-UA label for a row's kind. */
export const PAGE_KIND_LABELS: Record<PageEntityKind, string> = {
  [PageEntityKind.LEGAL]: d.kindLegal,
  [PageEntityKind.INFO]: d.kindInfo,
  [PageEntityKind.HUB]: d.kindHub,
};

/** The storefront address of a row, or `null` for a hub naming no section. */
export function pageSiteAddress(page: PageEntity): string | null {
  return pageSitePath(page.kind, page.slug);
}

/** «Відкрити на сайті» — PUBLISHED pages only (owner decision 2026-10-01). */
export function pageSiteHref(page: PageEntity): string | null {
  const path = pageSiteAddress(page);
  return page.status === "PUBLISHED" && path
    ? `${STOREFRONT_URL}${path}`
    : null;
}

/**
 * The status badge (TASK-430): reads `status`, NOT the `isActive` mirror —
 * which collapses DRAFT and SCHEDULED into one value. A schedule shows its
 * date AND time (PagesProposal СР1), full year included: a schedule typed into
 * the wrong year is the one mistake worth catching here.
 */
export function PageStatusBadge({ page }: { page: PageEntity }) {
  if (page.status === "SCHEDULED") {
    return (
      <Badge variant="outline" className="gap-1">
        <ClockIcon aria-hidden="true" className="size-3" />
        {page.scheduledAt
          ? d.statusScheduledOn(formatDateTime(page.scheduledAt))
          : // SCHEDULED with no instant should not exist (the API sets them
            // together) — say «Заплановано» rather than render "Invalid Date".
            d.statusScheduled}
      </Badge>
    );
  }
  const isPublished = page.status === "PUBLISHED";
  return (
    <Badge variant={isPublished ? "default" : "secondary"}>
      {isPublished ? d.statusPublished : d.statusDraft}
    </Badge>
  );
}

/** The one muted (or warning) line under the address — what the row DOES. */
function siteCaption(page: PageEntity): {
  text: string;
  warn: boolean;
} | null {
  // TASK-565 — visible, no longer a tooltip: renaming or unpublishing one of
  // these silently changes /info.
  if (isInlinedOnInfoHub(page.kind, page.slug)) {
    return { text: d.siteInlined, warn: true };
  }
  if (page.kind === PageEntityKind.HUB) return { text: d.siteHub, warn: false };
  if (page.status === "DRAFT") return { text: d.siteDraft, warn: false };
  if (page.status === "SCHEDULED" && page.scheduledAt) {
    return {
      text: d.siteScheduled(
        formatDate(page.scheduledAt),
        formatTime(page.scheduledAt),
      ),
      warn: false,
    };
  }
  return null;
}

/** «На сайті»: the address (a new-tab link when live) and its caption. */
export function PageSiteCell({ page }: { page: PageEntity }) {
  const path = pageSiteAddress(page);
  const href = pageSiteHref(page);
  const caption = siteCaption(page);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {path ? (
        href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={d.openPathAria(path)}
            className="inline-flex w-fit max-w-full items-center gap-1 rounded-xs font-mono text-sm text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="truncate">{path}</span>
            <ExternalLinkIcon
              aria-hidden="true"
              className="size-3.5 shrink-0"
            />
          </a>
        ) : (
          <span className="truncate font-mono text-sm text-primary">
            {path}
          </span>
        )
      ) : null}
      {caption ? (
        <span
          className={cn(
            "text-xs",
            caption.warn ? "text-warning" : "text-muted-foreground",
          )}
        >
          {caption.text}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The registry columns of the page list (PagesProposal СР1). Data, not
 * markup: the list adds the drag handle in front of the title itself, because
 * the handle belongs to the ROW (dnd-kit + the roving tabindex), not to a cell.
 */
export function buildPageColumns(): RegistryColumn<PageEntity>[] {
  return [
    {
      id: "title",
      label: d.colTitle,
      locked: true,
      defaultWidth: 360,
      minWidth: 200,
      cell: (page) => page.title,
    },
    {
      id: "site",
      label: d.colSite,
      defaultWidth: 330,
      minWidth: 160,
      cell: (page) => <PageSiteCell page={page} />,
    },
    {
      id: "kind",
      label: d.colKind,
      defaultWidth: 140,
      minWidth: 96,
      cell: (page) => (
        <Badge variant="outline">{PAGE_KIND_LABELS[page.kind]}</Badge>
      ),
    },
    {
      id: "status",
      label: d.colStatus,
      defaultWidth: 250,
      minWidth: 120,
      cell: (page) => <PageStatusBadge page={page} />,
    },
  ];
}
