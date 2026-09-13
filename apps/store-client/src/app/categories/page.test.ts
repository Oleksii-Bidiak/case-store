import type {
  PageEntity,
  SeoSettingsEntity,
} from "@/shared/api/generated/models";

// The route's default export pulls in the CategoriesView widget (client
// component tree); `generateMetadata` never touches it, so stub the barrel and
// keep this in the fast node project.
jest.mock("@/widgets/categories", () => ({ CategoriesView: () => null }));
jest.mock("@/shared/api/pages-server", () => ({
  fetchPublishedPage: jest.fn(),
  fetchPublishedPages: jest.fn().mockResolvedValue([]),
  pageDetailTag: (slug: string) => `page:${slug}`,
  PAGES_COLLECTION_TAG: "pages",
}));
jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn(),
  SEO_SETTINGS_TAG: "seo-settings",
}));

import { generateMetadata } from "./page";
import { fetchPublishedPage } from "@/shared/api/pages-server";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { dict } from "@/shared/config";

const fetchPage = fetchPublishedPage as jest.MockedFunction<
  typeof fetchPublishedPage
>;
const fetchSeo = fetchSeoSettings as jest.MockedFunction<
  typeof fetchSeoSettings
>;

function makeHubRow(overrides: Partial<PageEntity> = {}): PageEntity {
  return {
    id: "hub-categories",
    slug: "categories",
    kind: "HUB",
    title: "Розділ «Категорії»",
    content: "<p>SEO-картка розділу.</p>",
    excerpt: null,
    metaTitle: null,
    metaDescription: null,
    status: "PUBLISHED",
    publishedAt: null,
    scheduledAt: null,
    isActive: true,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const settings: SeoSettingsEntity = {
  id: "00000000-0000-0000-0000-000000000002",
  defaultMetaTitle: null,
  defaultMetaDescription: null,
  titleTemplate: null,
  defaultOgImage: null,
  noindexSite: false,
  llmsTxtSummary: null,
  additionalSameAsLinks: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => jest.clearAllMocks());

// TASK-435 — one worked example of `buildHubMetadata`; the other five hubs call
// it with nothing but different strings.
describe("categories hub generateMetadata", () => {
  it("reads the HUB row for this slug, not a page of some other kind", async () => {
    fetchPage.mockResolvedValue(makeHubRow());
    fetchSeo.mockResolvedValue(settings);

    await generateMetadata();

    expect(fetchPage).toHaveBeenCalledWith("categories", "HUB");
  });

  it("uses the hub row's metaTitle/metaDescription verbatim", async () => {
    fetchPage.mockResolvedValue(
      makeHubRow({
        metaTitle: "Категорії товарів | MobileStore",
        metaDescription: "Усі категорії магазину в одному списку.",
      }),
    );
    fetchSeo.mockResolvedValue(settings);

    const meta = await generateMetadata();

    expect(meta.title).toEqual({ absolute: "Категорії товарів | MobileStore" });
    expect(meta.description).toBe("Усі категорії магазину в одному списку.");
    expect(meta.alternates?.canonical).toBe("http://localhost:3000/categories");
  });

  it("falls back to this route's own strings when there is no hub row", async () => {
    fetchPage.mockResolvedValue(null);
    fetchSeo.mockResolvedValue(settings);

    const meta = await generateMetadata();

    expect(meta.title).toEqual({
      absolute: `${dict.meta.categoriesTitle} | MobileStore`,
    });
    expect(meta.description).toBe(dict.meta.categoriesDescription);
    expect(meta.alternates?.canonical).toBe("http://localhost:3000/categories");
  });

  it("keeps this route's strings ahead of the ONE store-wide default (TASK-432)", async () => {
    // The whole point of TASK-432: a single global sentence must not become the
    // description of every page that has none of its own. A hub with no row is
    // still more specific than the store-wide default, so the dictionary wins.
    fetchPage.mockResolvedValue(null);
    fetchSeo.mockResolvedValue({
      ...settings,
      defaultMetaTitle: "MobileStore — аксесуари та техніка",
      defaultMetaDescription: "Магазин аксесуарів та Apple-техніки в Україні.",
    });

    const meta = await generateMetadata();

    expect(meta.description).toBe(dict.meta.categoriesDescription);
    expect(meta.title).toEqual({
      absolute: `${dict.meta.categoriesTitle} | MobileStore`,
    });
  });

  it("survives an unreachable API (both reads null) without throwing", async () => {
    fetchPage.mockResolvedValue(null);
    fetchSeo.mockResolvedValue(null);

    const meta = await generateMetadata();

    expect(meta.description).toBe(dict.meta.categoriesDescription);
    expect(meta.openGraph).toBeDefined();
  });

  // TASK-437 — a hub row is a Page row, so it can carry its own `ogImage`. Wiring
  // it here is what keeps the new field from being editable in the panel and dead
  // on the six hubs.
  it("uses the hub row's own ogImage ahead of the store-wide default", async () => {
    fetchPage.mockResolvedValue(
      makeHubRow({ ogImage: "https://cdn.example.com/og/categories.jpg" }),
    );
    fetchSeo.mockResolvedValue({
      ...settings,
      defaultOgImage: "https://cdn.example.com/og/store.png",
    });

    const meta = await generateMetadata();

    expect(meta.openGraph?.images).toEqual([
      { url: "https://cdn.example.com/og/categories.jpg" },
    ]);
  });

  it("falls back to the store-wide default when the hub row has no ogImage", async () => {
    fetchPage.mockResolvedValue(makeHubRow());
    fetchSeo.mockResolvedValue({
      ...settings,
      defaultOgImage: "https://cdn.example.com/og/store.png",
    });

    const meta = await generateMetadata();

    expect(meta.openGraph?.images).toEqual([
      { url: "https://cdn.example.com/og/store.png" },
    ]);
  });
});
