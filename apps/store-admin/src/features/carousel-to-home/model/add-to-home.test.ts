import type { HomeBlockEntity } from "@/entities/home-block";
import { dict } from "@/shared/config";
import {
  MAX_HOME_BLOCK_TABS,
  defaultPosition,
  positionOptions,
  tabTargets,
  tabsAfterAppend,
} from "./add-to-home";

const t = dict.carouselToHome;
const h = dict.homeBlocks;

const summary = (id: string) => ({
  id,
  title: id,
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
    isSystem: true,
    isOrphaned: false,
    isEmpty: false,
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

const PAGE = [
  block("hero", 0),
  block("popular", 1, {
    type: "TABS",
    title: "Популярне",
    isSystem: false,
    tabs: [
      { sortOrder: 1, carousel: summary("b") },
      { sortOrder: 0, carousel: summary("a") },
    ],
  }),
  block("rail", 2, {
    type: "CAROUSEL",
    isSystem: false,
    carousel: summary("Чохли"),
  }),
  block("news", 3, { type: "NEWSLETTER" }),
];

describe("add carousel to home — model (TASK-664)", () => {
  it("offers the top and «after» every block, indexing the whole page", () => {
    expect(positionOptions(PAGE)).toEqual([
      { value: 0, label: t.positionFirst },
      { value: 1, label: t.positionAfter(h.hero) },
      { value: 2, label: t.positionAfter("Популярне") },
      { value: 3, label: t.positionAfter("Чохли") },
      { value: 4, label: t.positionAfter(h.newsletter) },
    ]);
  });

  it("defaults a new rail to right after the last carousel-bearing block", () => {
    expect(defaultPosition(PAGE)).toBe(3);
    expect(defaultPosition([block("hero", 0), block("news", 1)])).toBe(2);
    expect(defaultPosition([])).toBe(0);
  });

  it("offers only TABS blocks that can take one more tab", () => {
    const full = block("full", 4, {
      type: "TABS",
      title: "Повний",
      tabs: Array.from({ length: MAX_HOME_BLOCK_TABS }, (_, i) => ({
        sortOrder: i,
        carousel: summary(`c${i}`),
      })),
    });
    expect(tabTargets([...PAGE, full]).map((b) => b.id)).toEqual(["popular"]);
  });

  it("sends the complete tab list in order with the new tab last", () => {
    expect(tabsAfterAppend(PAGE[1], "new")).toEqual(["a", "b", "new"]);
    // Never twice.
    expect(tabsAfterAppend(PAGE[1], "a")).toEqual(["b", "a"]);
  });
});
