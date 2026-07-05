/**
 * Storage-model tests for the recently-viewed history (TASK-211). Runs in the
 * component (jsdom) project because the module talks to `window.localStorage`.
 * No JSX — the `.tsx` extension only routes the file to the jsdom test project.
 */
import {
  pushRecentlyViewed,
  readRecentlyViewed,
  clearRecentlyViewed,
} from "./recently-viewed-storage";

const STORAGE_KEY = "store-ai:recently-viewed";

function storedRaw(): unknown {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("recently-viewed storage (TASK-211 — minimal id snapshot)", () => {
  it("prepends new items most-recent-first and dedupes by id", () => {
    pushRecentlyViewed({ id: "p-1", slug: "one", name: "One" });
    pushRecentlyViewed({ id: "p-2", slug: "two", name: "Two" });
    pushRecentlyViewed({ id: "p-1", slug: "one", name: "One" });

    expect(readRecentlyViewed().map((i) => i.id)).toEqual(["p-1", "p-2"]);
  });

  it("caps the history at 12 items", () => {
    for (let i = 0; i < 15; i += 1) {
      pushRecentlyViewed({ id: `p-${i}`, slug: `s-${i}`, name: `N ${i}` });
    }

    const items = readRecentlyViewed();
    expect(items).toHaveLength(12);
    expect(items[0].id).toBe("p-14");
  });

  it("persists ONLY the minimal snapshot — never prices or image URLs", () => {
    pushRecentlyViewed({
      id: "p-1",
      slug: "one",
      name: "One",
      // Legacy callers used to pass a full price snapshot; even if one slips
      // through the types, it must not be persisted.
      price: "99.00",
      imageUrl: "https://cdn.example.com/x.webp",
    } as never);

    const [entry] = storedRaw() as Record<string, unknown>[];
    expect(Object.keys(entry).sort()).toEqual(["id", "name", "slug"]);
  });

  it("still parses legacy entries that carry the old full snapshot", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "legacy-1",
          name: "Legacy",
          slug: "legacy",
          price: "10.00",
          compareAtPrice: null,
          imageUrl: null,
        },
      ]),
    );

    expect(readRecentlyViewed().map((i) => i.id)).toEqual(["legacy-1"]);
  });

  it("drops entries without a usable id", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: "" }, { name: "no id" }, { id: "ok-1" }, 42]),
    );

    expect(readRecentlyViewed().map((i) => i.id)).toEqual(["ok-1"]);
  });

  it("returns an empty list for malformed JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");

    expect(readRecentlyViewed()).toEqual([]);
  });

  it("clearRecentlyViewed removes the stored history", () => {
    pushRecentlyViewed({ id: "p-1", slug: "one", name: "One" });

    clearRecentlyViewed();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(readRecentlyViewed()).toEqual([]);
  });
});
