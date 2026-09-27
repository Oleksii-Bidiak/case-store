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

import { isValidElement, type ReactElement } from "react";
import { SITE_URL, dict } from "@/shared/config";
import { fetchPublishedPosts } from "@/shared/api/blog-server";
import BlogPage, { generateMetadata } from "./page";

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

describe("/blog featured hero (TASK-833)", () => {
  function post(slug: string, featured = false) {
    return {
      id: `post-${slug}`,
      slug,
      title: `Title ${slug}`,
      excerpt: "Коротко.",
      content: "<p>Текст</p>",
      coverImageUrl: null,
      coverBlurDataUrl: null,
      authorName: "Ірина Ткач",
      author: null,
      readingMinutes: 2,
      featured,
      listed: true,
      category: { id: "cat-1", slug: "guides", name: "Гайди" },
      status: "PUBLISHED",
      publishedAt: "2026-06-22T09:00:00.000Z",
      scheduledAt: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-22T09:00:00.000Z",
    };
  }

  interface ViewProps {
    featured: { slug: string } | null;
    posts: { slug: string }[];
  }

  /** The props the hub hands `BlogView` — the hero and the grid. */
  async function viewProps(
    searchParams: Record<string, string> = {},
  ): Promise<ViewProps> {
    const tree = (await BlogPage({
      searchParams: Promise.resolve(searchParams),
    })) as ReactElement<{ children: unknown[] }>;
    const view = tree.props.children.find(
      (child): child is ReactElement<ViewProps> =>
        isValidElement(child) &&
        typeof child.props === "object" &&
        child.props !== null &&
        "featured" in child.props,
    );
    if (!view) throw new Error("BlogView not rendered");
    return view.props;
  }

  function serve(posts: ReturnType<typeof post>[]) {
    (fetchPublishedPosts as jest.Mock).mockResolvedValue({
      posts,
      meta: { total: posts.length, page: 1, limit: 9, totalPages: 1 },
    });
  }

  it("shows no hero when no post is marked — the newest post is not promoted", async () => {
    serve([post("newest"), post("older")]);

    const props = await viewProps();

    expect(props.featured).toBeNull();
    expect(props.posts.map((p) => p.slug)).toEqual(["newest", "older"]);
  });

  it("lifts the marked post into the hero and out of the grid", async () => {
    serve([post("marked", true), post("newest"), post("older")]);

    const props = await viewProps();

    expect(props.featured?.slug).toBe("marked");
    expect(props.posts.map((p) => p.slug)).toEqual(["newest", "older"]);
  });

  it("keeps the hero off a filtered view even for a marked post", async () => {
    serve([post("marked", true), post("newest")]);

    const props = await viewProps({ category: "guides" });

    expect(props.featured).toBeNull();
    expect(props.posts).toHaveLength(2);
  });

  it("labels the hero with the admin switch's own words", () => {
    expect(dict.blog.featuredBadge).toBe("Головна стаття тижня");
  });
});
