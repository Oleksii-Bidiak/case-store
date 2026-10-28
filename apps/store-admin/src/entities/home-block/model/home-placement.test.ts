import type { HomeBlockEntity } from "@/shared/api";
import { dict } from "@/shared/config";
import {
  carouselHomePlacements,
  describeHomePlacement,
  homeBlockLabel,
  homePlacementsByCarousel,
  sortHomeBlocks,
} from "./home-placement";

const h = dict.homeBlocks;

const summary = (id: string, title = id) => ({
  id,
  title,
  source: "NEWEST" as const,
  status: "PUBLISHED" as const,
});

function block(
  id: string,
  sortOrder: number,
  extra: Partial<HomeBlockEntity> = {},
): HomeBlockEntity {
  return {
    id,
    type: "HERO",
    title: null,
    sortOrder,
    status: "PUBLISHED",
    carousel: null,
    tabs: [],
    isSystem: false,
    isOrphaned: false,
    isEmpty: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...extra,
  };
}

// Given out of order on purpose: numbering follows sortOrder, not array order.
const BLOCKS: HomeBlockEntity[] = [
  block("rail", 3, { type: "CAROUSEL", carousel: summary("cases", "Чохли") }),
  block("hero", 0, { type: "HERO", isSystem: true }),
  block("popular", 1, {
    type: "TABS",
    title: "Популярне",
    // Tabs out of order too.
    tabs: [
      { sortOrder: 1, carousel: summary("new", "Новинки") },
      { sortOrder: 0, carousel: summary("hits", "Хіти") },
    ],
  }),
  block("acc", 2, {
    type: "TABS",
    title: "Аксесуари",
    status: "DRAFT",
    tabs: [{ sortOrder: 0, carousel: summary("cases", "Чохли") }],
  }),
];

describe("home placements (TASK-664)", () => {
  it("sorts blocks into page order", () => {
    expect(sortHomeBlocks(BLOCKS).map((b) => b.id)).toEqual([
      "hero",
      "popular",
      "acc",
      "rail",
    ]);
  });

  it("finds every block a carousel stands in, numbered by page position", () => {
    const cases = carouselHomePlacements(BLOCKS, "cases");
    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({
      kind: "tab",
      blockNumber: 3,
      tabNumber: 1,
      tabCount: 1,
    });
    expect(cases[1]).toMatchObject({ kind: "block", blockNumber: 4 });

    expect(carouselHomePlacements(BLOCKS, "new")[0]).toMatchObject({
      kind: "tab",
      blockNumber: 2,
      tabNumber: 2,
      tabCount: 2,
    });
  });

  it("returns nothing for a carousel no block points at", () => {
    expect(carouselHomePlacements(BLOCKS, "nowhere")).toEqual([]);
    expect(homePlacementsByCarousel(BLOCKS).has("nowhere")).toBe(false);
  });

  it("describes a placement in words, flagging a hidden block", () => {
    const [tab, rail] = carouselHomePlacements(BLOCKS, "cases");
    expect(describeHomePlacement(tab)).toEqual({
      where: h.asTab("Аксесуари"),
      position: h.tabPosition(1, 1, 3),
      hidden: h.blockDraft,
    });
    expect(describeHomePlacement(rail)).toEqual({
      where: h.asBlock("Чохли"),
      position: h.blockPosition(4),
      hidden: undefined,
    });
  });

  it("names singleton, orphaned and untitled blocks", () => {
    expect(homeBlockLabel(block("x", 0, { type: "NEWSLETTER" }))).toBe(
      h.newsletter,
    );
    expect(homeBlockLabel(block("x", 0, { type: "CAROUSEL" }))).toBe(
      h.carouselDeleted,
    );
    expect(homeBlockLabel(block("x", 0, { type: "TABS", title: " " }))).toBe(
      h.untitledTabs,
    );
  });
});
