import {
  accumulationKey,
  canLoadMore,
  mergeProductPages,
  nextLoadCount,
} from "./load-more";

describe("load-more model (TASK-216)", () => {
  describe("accumulationKey", () => {
    it("is stable for identical params regardless of key order", () => {
      expect(accumulationKey({ categoryId: "cat-1", page: 2, limit: 20 })).toBe(
        accumulationKey({ limit: 20, page: 2, categoryId: "cat-1" }),
      );
    });

    it("treats undefined values the same as absent keys", () => {
      expect(accumulationKey({ page: 1, search: undefined })).toBe(
        accumulationKey({ page: 1 }),
      );
    });

    it("changes when any filter changes", () => {
      const base = accumulationKey({ categoryId: "cat-1", page: 1 });
      expect(accumulationKey({ categoryId: "cat-2", page: 1 })).not.toBe(base);
      expect(accumulationKey({ categoryId: "cat-1", page: 2 })).not.toBe(base);
      expect(
        accumulationKey({ categoryId: "cat-1", page: 1, minPrice: 100 }),
      ).not.toBe(base);
      expect(
        accumulationKey({ categoryId: "cat-1", page: 1, sortBy: "price" }),
      ).not.toBe(base);
    });
  });

  describe("mergeProductPages", () => {
    const p = (id: string) => ({ id });

    it("flattens pages preserving page order", () => {
      expect(
        mergeProductPages([
          [p("a"), p("b")],
          [p("c"), p("d")],
        ]),
      ).toEqual([p("a"), p("b"), p("c"), p("d")]);
    });

    it("skips pages that are still in flight (undefined)", () => {
      expect(mergeProductPages([[p("a")], undefined, [p("b")]])).toEqual([
        p("a"),
        p("b"),
      ]);
    });

    it("dedupes by id when page boundaries shift between fetches", () => {
      // A product inserted at the top between fetches pushes "b" from page 1
      // onto page 2 — it must not render twice.
      expect(
        mergeProductPages([
          [p("a"), p("b")],
          [p("b"), p("c")],
        ]),
      ).toEqual([p("a"), p("b"), p("c")]);
    });

    it("returns an empty list for no pages", () => {
      expect(mergeProductPages([])).toEqual([]);
      expect(mergeProductPages([undefined])).toEqual([]);
    });
  });

  describe("canLoadMore", () => {
    it("allows appending while pages remain after base + extra", () => {
      expect(canLoadMore(1, 0, 3)).toBe(true);
      expect(canLoadMore(1, 1, 3)).toBe(true);
      expect(canLoadMore(2, 0, 3)).toBe(true);
    });

    it("stops at the last page", () => {
      expect(canLoadMore(1, 2, 3)).toBe(false);
      expect(canLoadMore(3, 0, 3)).toBe(false);
      expect(canLoadMore(1, 0, 1)).toBe(false);
      expect(canLoadMore(1, 0, 0)).toBe(false);
    });
  });

  describe("nextLoadCount", () => {
    it("returns a full page for interior pages", () => {
      // total 50, limit 20, loaded page 1 → next append brings 20.
      expect(nextLoadCount(50, 20, 1)).toBe(20);
    });

    it("returns the remainder on the final page", () => {
      // total 50, limit 20, loaded through page 2 → 10 items remain.
      expect(nextLoadCount(50, 20, 2)).toBe(10);
    });

    it("returns zero when everything is already shown", () => {
      expect(nextLoadCount(50, 20, 3)).toBe(0);
      expect(nextLoadCount(0, 20, 1)).toBe(0);
    });

    it("is defensive about degenerate limits", () => {
      expect(nextLoadCount(50, 0, 1)).toBe(0);
    });
  });
});
