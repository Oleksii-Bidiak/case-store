import type { HomeBlockEntity } from "@/entities/home-block";
import { dict } from "@/shared/config";
import {
  blockDuplicateNote,
  blockKind,
  blockProblem,
  blockSchedule,
  blockShownLabel,
  blockSummary,
  blockTabs,
} from "./home-block-row";

const d = dict.homeScreen;

function block(overrides: Partial<HomeBlockEntity> = {}): HomeBlockEntity {
  return {
    id: "b1",
    type: "CAROUSEL",
    title: null,
    sortOrder: 0,
    status: "PUBLISHED",
    scheduledAt: null,
    carousel: {
      id: "c1",
      title: "Редакція обирає",
      source: "MANUAL",
      status: "PUBLISHED",
    },
    tabs: [],
    isSystem: false,
    isOrphaned: false,
    isEmpty: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("home block row — words", () => {
  it("kind and summary per type", () => {
    expect(blockKind(block({ type: "HERO", isSystem: true }))).toBe(
      d.kind.system,
    );
    expect(blockSummary(block({ type: "HERO", carousel: null }))).toBe(
      d.summary.hero,
    );
    expect(blockSummary(block())).toBe(dict.carousels.sourceLabels.MANUAL);
    expect(
      blockSummary(
        block({
          carousel: {
            id: "c1",
            title: "Хіти",
            source: "BESTSELLING",
            status: "DRAFT",
          },
        }),
      ),
    ).toBe(
      `${dict.carousels.sourceAuto(dict.carousels.sourceLabels.BESTSELLING)} · ${d.carouselNotPublished}`,
    );
  });

  it("a TABS block counts its tabs and lists them in tab order", () => {
    const tabs = block({
      type: "TABS",
      title: "Популярне",
      carousel: null,
      tabs: [
        {
          sortOrder: 1,
          carousel: {
            id: "a",
            title: "Новинки",
            source: "NEWEST",
            status: "PUBLISHED",
          },
        },
        {
          sortOrder: 0,
          carousel: {
            id: "b",
            title: "Хіти",
            source: "BESTSELLING",
            status: "PUBLISHED",
          },
        },
      ],
    });
    expect(blockSummary(tabs)).toBe(d.tabsSummary(2));
    expect(blockTabs(tabs)).toEqual(["Хіти", "Новинки"]);
  });

  it("the switch's state in words", () => {
    expect(blockShownLabel(block())).toBe(d.shown);
    expect(blockShownLabel(block({ status: "DRAFT" }))).toBe(d.hidden);
    expect(blockShownLabel(block({ status: "SCHEDULED" }))).toBe(d.scheduled);
  });
});

describe("home block row — the yellow rows (ДН-4.8)", () => {
  it("nothing to say about a block that draws something", () => {
    expect(blockProblem(block())).toBeNull();
  });

  it("orphaned: the carousel was deleted", () => {
    expect(
      blockProblem(block({ carousel: null, isOrphaned: true, isEmpty: true })),
    ).toBe(d.warnOrphaned);
    expect(blockSummary(block({ carousel: null, isOrphaned: true }))).toBe(
      d.orphanSummary,
    );
  });

  it("empty: an unpublished carousel, a carousel with no products, tabs with none", () => {
    expect(
      blockProblem(
        block({
          isEmpty: true,
          carousel: {
            id: "c1",
            title: "Осінь",
            source: "MANUAL",
            status: "DRAFT",
          },
        }),
      ),
    ).toBe(d.warnCarouselNotPublished("Осінь"));
    expect(blockProblem(block({ isEmpty: true }))).toBe(d.warnCarouselEmpty);
    expect(
      blockProblem(block({ type: "TABS", carousel: null, isEmpty: true })),
    ).toBe(d.warnTabsEmpty);
  });
});

describe("home block row — schedule and duplicates", () => {
  it("a scheduled block carries its moment", () => {
    expect(blockSchedule(block())).toBeNull();
    const s = blockSchedule(
      block({ status: "SCHEDULED", scheduledAt: "2026-11-27T22:00:00.000Z" }),
    );
    expect(s?.badge).toContain("28.11.2026");
    expect(s?.note).toBe(d.warnScheduled("28.11.2026"));
  });

  it("the same carousel placed twice is noted, not refused", () => {
    const a = block({ id: "a" });
    const b = block({ id: "b", sortOrder: 1 });
    expect(blockDuplicateNote(a, [a])).toBeNull();
    expect(blockDuplicateNote(a, [a, b])).toBe(
      d.duplicateNote(dict.homeBlocks.asBlock("Редакція обирає")),
    );
  });
});
