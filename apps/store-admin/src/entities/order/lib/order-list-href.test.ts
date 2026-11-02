import { orderCardHref, orderListHref } from "./order-list-href";

const LIST_QUERY =
  "status=PENDING%2CCONFIRMED&pickupPointId=pp-1&page=3&search=%D0%9E%D0%BB%D0%B5%D0%BD%D0%B0&pageSize=50&sortBy=total&sortOrder=asc";

describe("orderCardHref (TASK-1977)", () => {
  it("is the bare card when the list has no query", () => {
    expect(orderCardHref("order-1")).toBe("/orders/order-1");
    expect(orderCardHref("order-1", "")).toBe("/orders/order-1");
    expect(orderCardHref("order-1", new URLSearchParams())).toBe(
      "/orders/order-1",
    );
  });

  it("carries the whole list query in ONE `from` parameter", () => {
    const href = orderCardHref("order-1", new URLSearchParams(LIST_QUERY));
    const url = new URL(href, "https://admin.example");
    expect(url.pathname).toBe("/orders/order-1");
    expect([...url.searchParams.keys()]).toEqual(["from"]);
    expect(url.searchParams.get("from")).toBe(
      new URLSearchParams(LIST_QUERY).toString(),
    );
  });

  it("round-trips: the card's `from` gives back the same list", () => {
    const params = new URLSearchParams(LIST_QUERY);
    const href = orderCardHref("order-1", params);
    const from = new URL(href, "https://admin.example").searchParams.get(
      "from",
    );
    expect(orderListHref(from)).toBe(`/orders?${params.toString()}`);
  });
});

describe("orderListHref (TASK-1977)", () => {
  it("is the plain list without a `from`", () => {
    expect(orderListHref(undefined)).toBe("/orders");
    expect(orderListHref(null)).toBe("/orders");
    expect(orderListHref("")).toBe("/orders");
    expect(orderListHref([])).toBe("/orders");
  });

  it("takes the first of a repeated `from`", () => {
    expect(orderListHref(["status=PENDING", "page=9"])).toBe(
      "/orders?status=PENDING",
    );
  });

  it.each([
    "https://evil.example/orders",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "../../logout",
    "?status=PENDING#https://evil.example",
  ])("never leaves /orders of this origin: %s", (from) => {
    const href = orderListHref(from);
    expect(href === "/orders" || href.startsWith("/orders?")).toBe(true);
    const url = new URL(href, "https://admin.example");
    expect(url.origin).toBe("https://admin.example");
    expect(url.pathname).toBe("/orders");
    expect(url.hash).toBe("");
  });

  it("drops a nested `from` so it cannot grow with every round trip", () => {
    expect(orderListHref("status=PENDING&from=page%3D2")).toBe(
      "/orders?status=PENDING",
    );
  });
});
