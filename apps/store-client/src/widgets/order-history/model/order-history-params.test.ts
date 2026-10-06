import {
  ORDER_TAB_STATUSES,
  ordersHref,
  parseOrderTab,
  parseOrdersPage,
  thumbStrip,
} from "./order-history-params";

describe("order history URL state (TASK-217)", () => {
  it.each([
    [null, "all"],
    ["", "all"],
    ["all", "all"],
    ["active", "active"],
    ["delivered", "delivered"],
    ["cancelled", "cancelled"],
    ["ACTIVE", "all"],
    ["shipped", "all"],
  ])("?status=%s → %s", (raw, tab) => {
    expect(parseOrderTab(raw)).toBe(tab);
  });

  it.each([
    [null, 1],
    ["", 1],
    ["0", 1],
    ["-3", 1],
    ["1.5", 1],
    ["abc", 1],
    ["1", 1],
    ["2", 2],
    ["17", 17],
  ])("?page=%s → %i", (raw, page) => {
    expect(parseOrdersPage(raw)).toBe(page);
  });

  it("groups the statuses the way the tabs read", () => {
    expect(ORDER_TAB_STATUSES.all).toBeUndefined();
    expect(ORDER_TAB_STATUSES.active).toEqual([
      "PENDING",
      "CONFIRMED",
      "PROCESSING",
      "SHIPPED",
    ]);
    expect(ORDER_TAB_STATUSES.delivered).toEqual(["DELIVERED"]);
    expect(ORDER_TAB_STATUSES.cancelled).toEqual(["CANCELLED", "REFUNDED"]);
  });

  it("leaves the defaults out of the URL", () => {
    const none = new URLSearchParams();
    expect(ordersHref("/account/orders", none, { tab: "all", page: 1 })).toBe(
      "/account/orders",
    );
    expect(
      ordersHref("/account/orders", none, { tab: "active", page: 1 }),
    ).toBe("/account/orders?status=active");
    expect(ordersHref("/account/orders", none, { tab: "all", page: 3 })).toBe(
      "/account/orders?page=3",
    );
  });

  it("replaces status and page but keeps every other parameter", () => {
    const current = new URLSearchParams("status=active&page=4&claimed=2");
    expect(
      ordersHref("/account/orders", current, { tab: "delivered", page: 2 }),
    ).toBe("/account/orders?claimed=2&status=delivered&page=2");
  });
});

describe("order card arithmetic (TASK-217)", () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => i);

  it.each([
    // lines, shown, narrowHidesLast, «+N» wide, «+N» narrow
    [1, 1, false, 0, 0],
    [3, 3, false, 0, 0],
    [4, 4, true, 0, 1],
    [5, 4, true, 1, 2],
    [6, 4, true, 2, 3],
  ])(
    "%i lines → %i thumbs, hides last below sm: %s, +%i wide, +%i narrow",
    (count, shown, hides, wide, narrow) => {
      const strip = thumbStrip(lines(count));
      expect(strip.shown).toHaveLength(shown);
      expect(strip.narrowHidesLast).toBe(hides);
      expect(strip.moreWide).toBe(wide);
      expect(strip.moreNarrow).toBe(narrow);
    },
  );
});
