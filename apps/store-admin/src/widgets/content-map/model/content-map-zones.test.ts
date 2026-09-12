import {
  CONTENT_MAP_ZONES,
  CONTENT_MAP_PAGE_GROUPS,
  resolveZoneVisibility,
  type ContentMapZoneId,
} from "./content-map-zones";

describe("content-map zone config (TASK-264-A)", () => {
  // Ten since TASK-429 added the /promo zone (AD-CNT-26).
  it("has ten zones with unique ids", () => {
    expect(CONTENT_MAP_ZONES).toHaveLength(10);
    const ids = CONTENT_MAP_ZONES.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("groups into six page frames", () => {
    expect(CONTENT_MAP_PAGE_GROUPS).toHaveLength(6);
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

  // The two settings singletons have no "N active items" notion at all; the
  // /promo row (TASK-429) opts out for a different reason — its count lives behind
  // the MARKETING permission zone, so fetching it here would show a content
  // manager a red error badge instead of a working link. Anything ELSE with a null
  // count is a mistake, which is what this list pins.
  it("only the settings singletons and the /promo row carry a null count", () => {
    const nullCountIds = CONTENT_MAP_ZONES.filter((z) => z.count === null).map(
      (z) => z.id,
    );
    expect(new Set(nullCountIds)).toEqual(
      new Set(["site-contact", "seo-settings", "promo-codes"]),
    );
  });

  it("puts the storefront /promo page on the map, pointing at /discounts", () => {
    const promo = CONTENT_MAP_ZONES.find((z) => z.id === "promo-codes");

    expect(promo).toBeDefined();
    expect(promo?.targetHref).toBe("/discounts");
    // It belongs to its own page frame, like the blog page.
    expect(
      CONTENT_MAP_PAGE_GROUPS.find((g) => g.zoneIds.includes("promo-codes"))
        ?.id,
    ).toBe("promo");
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
