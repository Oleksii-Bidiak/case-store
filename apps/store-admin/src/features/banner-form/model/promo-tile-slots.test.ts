import type { BannerEntity } from "@/entities/banner";
import { MAX_PROMO_TILES, promoTileSlots } from "./promo-tile-slots";

function banner(
  id: string,
  status: BannerEntity["status"] = "PUBLISHED",
  placement: BannerEntity["placement"] = "PROMO_TILE",
): BannerEntity {
  return {
    id,
    placement,
    title: id,
    subtitle: null,
    imageUrl: null,
    imageBlurDataUrl: null,
    ctaLabel: null,
    ctaHref: null,
    theme: null,
    sortOrder: 0,
    status,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

const tiles = (n: number) =>
  Array.from({ length: n }, (_, i) => banner(`t${i + 1}`));

describe("promoTileSlots (TASK-2013)", () => {
  it("counts published and scheduled tiles, never drafts or other placements", () => {
    const slots = promoTileSlots({
      banners: [
        banner("a"),
        banner("b", "SCHEDULED"),
        banner("c", "DRAFT"),
        banner("d", "PUBLISHED", "HERO_SLIDE"),
      ],
      placement: "PROMO_TILE",
      status: "DRAFT",
    });

    expect(slots).toMatchObject({
      used: 2,
      max: 5,
      occupies: false,
      full: false,
    });
    expect(slots.position).toBeUndefined();
  });

  it("adds a new published tile as the next position", () => {
    const slots = promoTileSlots({
      banners: tiles(2),
      placement: "PROMO_TILE",
      status: "PUBLISHED",
    });

    expect(slots).toMatchObject({
      used: 3,
      occupies: true,
      full: false,
      position: 3,
    });
  });

  it("is full when a sixth tile would start holding a slot", () => {
    const slots = promoTileSlots({
      banners: tiles(MAX_PROMO_TILES),
      placement: "PROMO_TILE",
      status: "SCHEDULED",
    });

    expect(slots).toMatchObject({ used: 5, full: true });
    expect(slots.position).toBeUndefined();
  });

  it("lets a tile that already holds a slot be re-saved and keep its place", () => {
    const slots = promoTileSlots({
      banners: tiles(MAX_PROMO_TILES),
      bannerId: "t2",
      placement: "PROMO_TILE",
      status: "PUBLISHED",
    });

    expect(slots).toMatchObject({ used: 5, full: false, position: 2 });
  });

  it("frees the slot live when the operator switches the tile to a draft", () => {
    const slots = promoTileSlots({
      banners: tiles(3),
      bannerId: "t3",
      placement: "PROMO_TILE",
      status: "DRAFT",
    });

    expect(slots).toMatchObject({ used: 2, occupies: false });
  });

  it("treats a stored draft becoming published as a new slot", () => {
    const slots = promoTileSlots({
      banners: [...tiles(MAX_PROMO_TILES), banner("draft", "DRAFT")],
      bannerId: "draft",
      placement: "PROMO_TILE",
      status: "PUBLISHED",
    });

    expect(slots.full).toBe(true);
  });
});
