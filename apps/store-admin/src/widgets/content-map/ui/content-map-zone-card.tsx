import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  resolveZoneVisibility,
  type ContentMapZone,
} from "../model/content-map-zones";

/**
 * The resolved count state for a single zone, derived in `ContentMapView` from
 * the four shared list queries. `none` is a settings-singleton zone (no count
 * notion); the others mirror the backing query's lifecycle so a slow or failed
 * count degrades only that zone's badge — never its navigation link.
 */
export type ZoneCountState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; value: number };

interface ContentMapZoneCardProps {
  zone: ContentMapZone;
  countState: ZoneCountState;
}

/**
 * One zone row inside a page frame: `sourceLabel → (arrow) → Link(targetLabel)`,
 * an "applies to" caption, and — for list-backed zones only — the resolved
 * active count plus a Показується/Приховано marker. The target `Link` always
 * renders regardless of `countState`, so navigation never blocks on a count.
 */
export function ContentMapZoneCard({
  zone,
  countState,
}: ContentMapZoneCardProps) {
  return (
    <div
      data-zone-id={zone.id}
      className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-md border border-border bg-card p-3 shadow-card"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{zone.sourceLabel}</span>
          <ArrowRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <Link
            href={zone.targetHref}
            className="rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            {zone.targetLabel}
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">{dict.contentMap.appliesToLabel}</span>{" "}
          {zone.appliesTo}
        </p>
      </div>

      <ZoneCount countState={countState} />
    </div>
  );
}

/**
 * The count/marker block, rendered only for list-backed zones. Kept local to the
 * card so a `none` zone (site-contact, seo-settings) renders no element at all —
 * not a "—" placeholder.
 */
function ZoneCount({ countState }: { countState: ZoneCountState }) {
  if (countState.status === "none") {
    return null;
  }

  if (countState.status === "loading") {
    return (
      <span className="text-xs text-muted-foreground">
        {dict.contentMap.loading}
      </span>
    );
  }

  if (countState.status === "error") {
    return (
      <span role="alert" className="text-xs text-destructive">
        {dict.contentMap.loadError}
      </span>
    );
  }

  const visibility = resolveZoneVisibility(countState.value);
  const shown = visibility === "shown";

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        className="text-sm tabular-nums text-muted-foreground"
        aria-label={dict.contentMap.countAria(countState.value)}
      >
        {countState.value}
      </span>
      <Badge variant={shown ? "default" : "secondary"}>
        {shown ? dict.contentMap.statusShown : dict.contentMap.statusHidden}
      </Badge>
    </div>
  );
}
