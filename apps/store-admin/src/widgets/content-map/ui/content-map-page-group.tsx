import {
  CONTENT_MAP_ZONES,
  type ContentMapPageGroup as ContentMapPageGroupModel,
  type ContentMapZone,
  type ContentMapZoneId,
} from "../model/content-map-zones";
import {
  ContentMapZoneCard,
  type ZoneCountState,
} from "./content-map-zone-card";

/** Zone lookup by id — built once from the static config for O(1) resolution. */
const ZONE_BY_ID: Record<ContentMapZoneId, ContentMapZone> = Object.fromEntries(
  CONTENT_MAP_ZONES.map((zone) => [zone.id, zone]),
) as Record<ContentMapZoneId, ContentMapZone>;

interface ContentMapPageGroupProps {
  group: ContentMapPageGroupModel;
  /** Resolved count state per zone id, computed once in `ContentMapView`. */
  countStates: Record<ContentMapZoneId, ZoneCountState>;
}

/**
 * One storefront "page frame": a bordered box with the area heading and its
 * zones stacked inside, in the config's array order.
 */
export function ContentMapPageGroup({
  group,
  countStates,
}: ContentMapPageGroupProps) {
  return (
    <section
      aria-label={group.heading}
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4"
    >
      <h3 className="text-base font-semibold text-foreground">
        {group.heading}
      </h3>
      <div className="flex flex-col gap-2">
        {group.zoneIds.map((zoneId) => (
          <ContentMapZoneCard
            key={zoneId}
            zone={ZONE_BY_ID[zoneId]}
            countState={countStates[zoneId]}
          />
        ))}
      </div>
    </section>
  );
}
