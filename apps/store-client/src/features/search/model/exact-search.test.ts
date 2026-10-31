import { exactSearchHref, isExactSearch } from "./exact-search";

describe("exact search (TASK-2069)", () => {
  it("reads only the literal flag", () => {
    expect(isExactSearch(new URLSearchParams("q=x&exact=1"))).toBe(true);
    expect(isExactSearch(new URLSearchParams("q=x&exact=true"))).toBe(false);
    expect(isExactSearch(new URLSearchParams("q=x"))).toBe(false);
  });

  it("builds the exact link from a bare query", () => {
    const href = exactSearchHref("iphone 15 про");
    const params = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/search?")).toBe(true);
    expect(params.get("q")).toBe("iphone 15 про");
    expect(params.get("exact")).toBe("1");
  });

  it("keeps the other filters but drops the category and the page", () => {
    const href = exactSearchHref(
      "чохол айфон",
      new URLSearchParams(
        "q=old&category=cases&page=3&sort=price_asc&inStock=true",
      ),
    );
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("q")).toBe("чохол айфон");
    expect(params.get("category")).toBeNull();
    expect(params.get("page")).toBeNull();
    expect(params.get("sort")).toBe("price_asc");
    expect(params.get("inStock")).toBe("true");
    expect(params.get("exact")).toBe("1");
  });
});
