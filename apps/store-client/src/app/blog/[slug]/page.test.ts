import type { BlogPostEntity } from "@/shared/api/generated/models";

// Mock the ISR-tagged server fetchers the route composes.
jest.mock("@/shared/api/blog-server", () => ({
  fetchPublishedPost: jest.fn(),
  fetchPublishedPosts: jest.fn().mockResolvedValue({ posts: [], total: 0 }),
}));
// The article widget pulls in heavy client deps; the redirect tests never
// render it, so stub the barrel (same idiom as legal/[slug]/page.test.ts).
jest.mock("@/widgets/blog", () => ({
  BlogArticleView: () => null,
  toBlogPostView: (entity: { slug: string; category?: { slug?: string } }) => ({
    ...entity,
    categorySlug: entity.category?.slug ?? "guides",
    author: "Автор",
    publishedAt: null,
  }),
}));
// Next's notFound()/permanentRedirect() throw special signals; mock them with
// throwing jest.fn()s so the tests can assert which one fired.
jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
// Slug-redirect lookup (TASK-285) — mocked per-case below.
jest.mock("@/shared/lib/slug-redirect", () => ({
  resolveSlugRedirect: jest.fn(),
}));

import BlogArticlePage, { generateMetadata } from "./page";
import { notFound, permanentRedirect } from "next/navigation";
import { fetchPublishedPost } from "@/shared/api/blog-server";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";
import { BRAND_OG_IMAGE_PATH, SITE_NAME, SITE_URL } from "@/shared/config";

const fetchPost = fetchPublishedPost as jest.MockedFunction<
  typeof fetchPublishedPost
>;
const resolveRedirect = resolveSlugRedirect as jest.MockedFunction<
  typeof resolveSlugRedirect
>;

function makePost(): BlogPostEntity {
  return {
    id: "post-1",
    slug: "iphone-16-oglyad",
    title: "Огляд iPhone 16",
    excerpt: "Короткий опис",
    content: "<p>Body</p>",
    coverImageUrl: null,
    coverBlurDataUrl: null,
    authorName: "Автор",
    readingMinutes: 5,
    featured: false,
    categoryId: "cat-1",
    category: { id: "cat-1", slug: "guides", name: "Гайди" },
    status: "PUBLISHED",
    publishedAt: "2026-06-01T09:00:00.000Z",
    scheduledAt: null,
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-01T09:00:00.000Z",
  } as BlogPostEntity;
}

afterEach(() => jest.clearAllMocks());

describe("blog/[slug] slug-redirect (TASK-285)", () => {
  const runPage = (slug: string) =>
    BlogArticlePage({ params: Promise.resolve({ slug }) });

  it("permanently redirects a renamed slug to its current address", async () => {
    fetchPost.mockResolvedValue(null); // dead slug — content fetch 404s
    resolveRedirect.mockResolvedValue("novyi-slug");

    await expect(runPage("staryi-slug")).rejects.toThrow(
      "NEXT_REDIRECT:/blog/novyi-slug",
    );

    expect(resolveRedirect).toHaveBeenCalledWith("BLOG_POST", "staryi-slug");
    expect(permanentRedirect).toHaveBeenCalledWith("/blog/novyi-slug");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("still 404s a dead slug with no redirect row (regression)", async () => {
    fetchPost.mockResolvedValue(null);
    resolveRedirect.mockResolvedValue(null);

    await expect(runPage("never-existed")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(notFound).toHaveBeenCalled();
  });

  it("never consults the redirect ledger when the post resolves", async () => {
    fetchPost.mockResolvedValue(makePost());

    await runPage("iphone-16-oglyad");

    expect(resolveRedirect).not.toHaveBeenCalled();
    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });
});

// Next merges metadata SHALLOWLY: a route that declares its own `openGraph`
// replaces the root layout's object entirely. So every such block owes the
// preview three things the root used to supply — siteName, locale and images —
// and forgetting one is invisible in a helper-level unit test. These assert the
// assembled object, which is where that omission actually shows up (TASK-432).
describe("blog/[slug] generateMetadata — the openGraph block it must re-state", () => {
  const runMeta = (slug: string) =>
    generateMetadata({ params: Promise.resolve({ slug }) });

  it("re-states siteName and locale lost with the root openGraph", async () => {
    fetchPost.mockResolvedValue(makePost());

    const meta = await runMeta("iphone-16-oglyad");

    expect(meta.openGraph).toMatchObject({
      siteName: SITE_NAME,
      locale: "uk_UA",
      type: "article",
      url: `${SITE_URL}/blog/iphone-16-oglyad`,
    });
  });

  it("uses the article's own cover as the OG card when it has one", async () => {
    fetchPost.mockResolvedValue({
      ...makePost(),
      coverImageUrl: "https://cdn.example/cover.webp",
    });

    const meta = await runMeta("iphone-16-oglyad");

    expect(meta.openGraph?.images).toEqual([
      { url: "https://cdn.example/cover.webp" },
    ]);
  });

  it("falls back to the brand card rather than shipping no image at all", async () => {
    fetchPost.mockResolvedValue(makePost()); // coverImageUrl: null

    const meta = await runMeta("iphone-16-oglyad");

    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({ url: BRAND_OG_IMAGE_PATH }),
    ]);
  });

  it("404s an unknown slug instead of inventing metadata", async () => {
    fetchPost.mockResolvedValue(null);

    const meta = await runMeta("never-existed");

    expect(meta.openGraph).toBeUndefined();
  });
});
