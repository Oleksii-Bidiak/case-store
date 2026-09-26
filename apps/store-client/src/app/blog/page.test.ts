// The hub renders the interactive BlogView (a client tree) — stubbed; the
// view-model mapper stays real, it is what the page feeds the hero with.
jest.mock("@/widgets/blog", () => ({
  ...jest.requireActual("@/widgets/blog/model/posts"),
  BlogView: () => null,
}));
jest.mock("@/shared/api/blog-server", () => ({
  fetchPublishedPosts: jest.fn(),
  fetchBlogCategories: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/shared/api/pages-server", () => ({
  fetchPublishedPage: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn().mockResolvedValue(null),
}));

import { SITE_URL } from "@/shared/config";
import { generateMetadata } from "./page";

const meta = (searchParams: Record<string, string> = {}) =>
  generateMetadata({ searchParams: Promise.resolve(searchParams) });

afterEach(() => jest.clearAllMocks());

describe("/blog metadata (TASK-524)", () => {
  it("canonicalizes the first page onto /blog, indexable", async () => {
    const result = await meta();

    expect(result.alternates?.canonical).toBe(`${SITE_URL}/blog`);
    expect(result.robots).toBeUndefined();
  });

  it("gives every later page its own canonical — each is a different slice", async () => {
    const result = await meta({ page: "3" });

    expect(result.alternates?.canonical).toBe(`${SITE_URL}/blog?page=3`);
    expect(result.robots).toBeUndefined();
  });

  it("treats ?page=1 and garbage as the first page", async () => {
    expect((await meta({ page: "1" })).alternates?.canonical).toBe(
      `${SITE_URL}/blog`,
    );
    expect((await meta({ page: "abc" })).alternates?.canonical).toBe(
      `${SITE_URL}/blog`,
    );
  });

  it.each([
    ["a search", { q: "навушники" }],
    ["a category chip", { category: "guides" }],
    ["a paged search", { q: "навушники", page: "2" }],
  ])("noindexes %s and drops the canonical", async (_label, params) => {
    const result = await meta(params);

    expect(result.robots).toEqual({ index: false, follow: true });
    expect(result.alternates).toBeUndefined();
    expect(result.openGraph?.url).toBe(`${SITE_URL}/blog`);
  });

  it("does not count a whitespace-only search as a filter", async () => {
    const result = await meta({ q: "   " });

    expect(result.robots).toBeUndefined();
    expect(result.alternates?.canonical).toBe(`${SITE_URL}/blog`);
  });
});
