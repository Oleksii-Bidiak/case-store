import type { HomeBlockEntity } from "@/entities/home-block";
import { dict } from "@/shared/config";
import {
  carouselElsewhere,
  defaultPosition,
  draftFromBlock,
  emptyDraft,
  moveTab,
  positionOptions,
  toCreateDto,
  toUpdateDto,
  validateDraft,
  type HomeBlockDraft,
} from "./home-block-form";

const e = dict.homeBlockDialog.errors;

const summary = (id: string, title: string) => ({
  id,
  title,
  source: "MANUAL" as const,
  status: "PUBLISHED" as const,
});

function block(
  id: string,
  sortOrder: number,
  overrides: Partial<HomeBlockEntity> = {},
): HomeBlockEntity {
  return {
    id,
    type: "HERO",
    title: null,
    sortOrder,
    status: "PUBLISHED",
    scheduledAt: null,
    carousel: null,
    tabs: [],
    isSystem: true,
    isOrphaned: false,
    isEmpty: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const BLOCKS: HomeBlockEntity[] = [
  block("hero", 0),
  block("tabs", 1, {
    type: "TABS",
    title: "Популярне",
    isSystem: false,
    tabs: [
      { sortOrder: 1, carousel: summary("c-new", "Новинки") },
      { sortOrder: 0, carousel: summary("c-hits", "Хіти") },
    ],
  }),
  block("rail", 2, {
    type: "CAROUSEL",
    isSystem: false,
    carousel: summary("c-picks", "Редакція обирає"),
  }),
  block("news", 3, { type: "NEWSLETTER" }),
];

const NOW = new Date("2026-10-28T12:00:00.000Z");

describe("positions", () => {
  it("offers the very top, then «after» every block — hidden ones too", () => {
    expect(positionOptions(BLOCKS).map((o) => o.value)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(positionOptions(BLOCKS)[3].label).toBe(
      dict.carouselToHome.positionAfter("Редакція обирає"),
    );
  });

  it("defaults to right after the last carousel-bearing block", () => {
    expect(defaultPosition(BLOCKS)).toBe(3);
    expect(defaultPosition([block("hero", 0)])).toBe(1);
  });
});

describe("carouselElsewhere — the same carousel twice is allowed, and said", () => {
  it("names every other place the carousel stands", () => {
    expect(carouselElsewhere(BLOCKS, "c-hits")).toEqual([
      dict.homeBlocks.asTab("Популярне"),
    ]);
    expect(carouselElsewhere(BLOCKS, "c-other")).toEqual([]);
  });

  it("does not count the block being edited", () => {
    expect(carouselElsewhere(BLOCKS, "c-picks", "rail")).toEqual([]);
  });
});

describe("validateDraft", () => {
  it("a CAROUSEL block needs a carousel", () => {
    expect(validateDraft(emptyDraft(0), "create", NOW)).toEqual({
      carouselId: e.carouselRequired,
    });
  });

  it("a TABS block needs a title and at least one tab", () => {
    const draft: HomeBlockDraft = {
      ...emptyDraft(0),
      type: "TABS",
      title: " ",
    };
    expect(validateDraft(draft, "create", NOW)).toEqual({
      title: e.titleRequired,
      tabs: e.tabsRequired,
    });
  });

  it("a schedule needs a moment in the future", () => {
    const base: HomeBlockDraft = {
      ...emptyDraft(0),
      carouselId: "c-picks",
      show: "schedule",
    };
    expect(validateDraft(base, "create", NOW).scheduledAt).toBe(
      e.scheduledAtRequired,
    );
    expect(
      validateDraft({ ...base, scheduledAt: "2026-10-01T10:00" }, "create", NOW)
        .scheduledAt,
    ).toBe(e.scheduledAtPast);
    expect(
      validateDraft(
        { ...base, scheduledAt: "2026-11-28T00:00" },
        "create",
        NOW,
      ),
    ).toEqual({});
  });
});

describe("payloads", () => {
  it("create CAROUSEL, live at once — only the carousel's fields", () => {
    expect(
      toCreateDto({ ...emptyDraft(3), carouselId: "c-picks", title: "x" }),
    ).toEqual({
      type: "CAROUSEL",
      carouselId: "c-picks",
      status: "PUBLISHED",
      position: 3,
    });
  });

  it("create TABS as a draft — title trimmed, tabs in order", () => {
    expect(
      toCreateDto({
        ...emptyDraft(1),
        type: "TABS",
        carouselId: "ignored",
        title: "  Чорна пʼятниця ",
        tabs: ["c-new", "c-hits"],
        show: "draft",
      }),
    ).toEqual({
      type: "TABS",
      title: "Чорна пʼятниця",
      tabs: ["c-new", "c-hits"],
      status: "DRAFT",
      position: 1,
    });
  });

  it("create scheduled — the Kyiv wall clock as an instant", () => {
    const dto = toCreateDto({
      ...emptyDraft(0),
      carouselId: "c-picks",
      show: "schedule",
      scheduledAt: "2026-11-28T00:00",
    });
    expect(dto.status).toBe("SCHEDULED");
    // Kyiv is UTC+2 in November.
    expect(dto.scheduledAt).toBe("2026-11-27T22:00:00.000Z");
  });

  it("edit sends the content only — never status or position", () => {
    expect(toUpdateDto(draftFromBlock(BLOCKS[1]))).toEqual({
      title: "Популярне",
      tabs: ["c-hits", "c-new"],
    });
    expect(toUpdateDto(draftFromBlock(BLOCKS[2]))).toEqual({
      carouselId: "c-picks",
    });
  });
});

describe("moveTab", () => {
  it("swaps with the neighbour and ignores out-of-range moves", () => {
    expect(moveTab(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveTab(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveTab(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});
