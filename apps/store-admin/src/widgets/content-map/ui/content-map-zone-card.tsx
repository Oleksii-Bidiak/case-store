import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { dict, STOREFRONT_URL } from "@/shared/config";
import type { ContentMapZone } from "../model/content-map-zones";
import type { ZoneState } from "../model/zone-state";

const c = dict.contentMap;

interface ContentMapZoneCardProps {
  zone: ContentMapZone;
  /** 1-based number of the zone on its tab — the same number as in the schema. */
  number: number;
  /** The tab's wording for a zone that sits on two tabs. */
  title?: string;
  appliesTo?: string;
  state: ZoneState;
  selected: boolean;
  onSelect: () => void;
  /** DOM id — the schema scrolls a selected card into view. */
  id: string;
}

/**
 * One zone (ContentMapProposal ДЩ1): a FIXED grid — the number, then the
 * title and where it sits, then a right column of the same width on every card
 * with what is in the zone now, a warning badge, «Розділ →» and «на сайті ↗».
 * The number never shifts under a long description (the as-is defect).
 *
 * The links always render, whatever the state: navigation never waits on a
 * count, and a zone the session cannot read still says where it is edited.
 */
export function ContentMapZoneCard({
  zone,
  number,
  title,
  appliesTo,
  state,
  selected,
  onSelect,
  id,
}: ContentMapZoneCardProps) {
  const name = title ?? zone.sourceLabel;
  return (
    <li
      id={id}
      data-zone-id={zone.id}
      data-selected={selected}
      onClick={(event) => {
        // A click on a link inside is the link's business.
        if ((event.target as Element).closest("a")) return;
        onSelect();
      }}
      className={cn(
        "flex scroll-mt-4 gap-3 rounded-lg border bg-card p-4 shadow-card transition-colors motion-reduce:transition-none",
        selected && "border-primary ring-1 ring-primary",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
          selected
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            <span className="sr-only">{`${number}. `}</span>
            {name}
            {zone.later ? (
              <Badge variant="outline" className="font-mono font-normal">
                {c.laterTag}
              </Badge>
            ) : null}
          </h3>
          <p className="text-xs text-muted-foreground">
            {appliesTo ?? zone.appliesTo}
          </p>
        </div>

        <div className="flex flex-col gap-2 md:w-80 md:shrink-0 md:items-end md:text-right">
          <ZoneStateLine state={state} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm md:justify-end">
            <Link
              href={zone.targetHref}
              aria-label={c.editAria(name, zone.targetLabel)}
              className="rounded-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {zone.targetLabel}
              <span aria-hidden="true"> →</span>
            </Link>
            {zone.sitePath ? (
              <a
                href={`${STOREFRONT_URL}${zone.sitePath}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={c.onSiteAria(name)}
                className="inline-flex items-center gap-1 rounded-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
                {c.onSite}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

/** What is in the zone now — or nothing, when this session may not read it. */
function ZoneStateLine({ state }: { state: ZoneState }) {
  switch (state.status) {
    case "unavailable":
      return null;
    case "loading":
      return <p className="text-sm text-muted-foreground">{c.loading}</p>;
    case "error":
      return (
        <p role="alert" className="text-sm text-destructive">
          {c.loadError}
        </p>
      );
    case "ready":
      return (
        <>
          <p className="text-sm text-foreground">{state.summary}</p>
          {state.badge ? (
            <Badge
              variant="outline"
              className={cn(
                "w-fit",
                state.badge.tone === "warning"
                  ? "border-warning/40 bg-warning/10 text-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              {state.badge.text}
            </Badge>
          ) : null}
        </>
      );
  }
}
