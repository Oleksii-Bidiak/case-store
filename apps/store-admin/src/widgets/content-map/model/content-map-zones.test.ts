import {
  CONTENT_MAP_ZONES,
  CONTENT_MAP_PAGE_GROUPS,
  resolveZoneVisibility,
  type ContentMapZoneId,
} from "./content-map-zones";

describe("content-map zone config (TASK-264-A)", () => {
  it("has nine zones with unique ids", () => {
    expect(CONTENT_MAP_ZONES).toHaveLength(9);
    const ids = CONTENT_MAP_ZONES.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("groups into five page frames", () => {
    expect(CONTENT_MAP_PAGE_GROUPS).toHaveLength(5);
    const groupIds = CONTENT_MAP_PAGE_GROUPS.map((g) => g.id);
    expect(new Set(groupIds).size).toBe(groupIds.length);
  });

  it("every page-group zoneId resolves to a real zone (no dangling reference)", () => {
    const known = new Set<ContentMapZoneId>(CONTENT_MAP_ZONES.map((z) => z.id));
    for (const group of CONTENT_MAP_PAGE_GROUPS) {
      for (const zoneId of group.zoneIds) {
        expect(known.has(zoneId)).toBe(true);
      }
    }
  });

  it("places every zone in exactly one page group (complete, no orphans)", () => {
    const placed = CONTENT_MAP_PAGE_GROUPS.flatMap((g) => g.zoneIds);
    expect(new Set(placed).size).toBe(placed.length); // no zone in two groups
    expect(new Set(placed)).toEqual(
      new Set(CONTENT_MAP_ZONES.map((z) => z.id)),
    );
  });

  it("has no duplicate target hrefs (each zone links somewhere distinct)", () => {
    const hrefs = CONTENT_MAP_ZONES.map((z) => z.targetHref);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("banner zones deep-link with a ?placement= param matching their count placement", () => {
    for (const zone of CONTENT_MAP_ZONES) {
      if (zone.count?.kind === "banner") {
        expect(zone.targetHref).toBe(
          `/banners?placement=${zone.count.placement}`,
        );
      }
    }
  });

  it("only the two settings singletons carry a null count", () => {
    const nullCountIds = CONTENT_MAP_ZONES.filter((z) => z.count === null).map(
      (z) => z.id,
    );
    expect(new Set(nullCountIds)).toEqual(
      new Set(["site-contact", "seo-settings"]),
    );
  });

  it("every zone exposes non-empty source/target labels", () => {
    for (const zone of CONTENT_MAP_ZONES) {
      expect(zone.sourceLabel.length).toBeGreaterThan(0);
      expect(zone.targetLabel.length).toBeGreaterThan(0);
      expect(zone.targetHref.startsWith("/")).toBe(true);
    }
  });
});

describe("resolveZoneVisibility (TASK-264-A)", () => {
  it("returns 'hidden' for a zero count", () => {
    expect(resolveZoneVisibility(0)).toBe("hidden");
  });

  it("returns 'shown' for positive counts", () => {
    expect(resolveZoneVisibility(1)).toBe("shown");
    expect(resolveZoneVisibility(5)).toBe("shown");
  });
});
