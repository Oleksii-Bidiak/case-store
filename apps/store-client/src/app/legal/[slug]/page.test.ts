import type { PageEntity } from "@/shared/api/generated/models";
import type { SeoSettingsEntity } from "@/shared/api/generated/models";

// Mock the two ISR-tagged server fetchers the route composes; everything else
// (resolveSeo / toMetadataTitle / SITE_NAME) runs for real so this pins the real
// tiering behavior, matching the product route's generateMetadata (TASK-268 review).
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
// The route's default export imports the LegalDocView widget, whose transitive
// `sanitize-html` → `isomorphic-dompurify` (bundled jsdom) can't initialize in
// the node unit project. generateMetadata never touches it, so stub the barrel.
jest.mock("@/widgets/legal-doc", () => ({ LegalDocView: () => null }));

import { generateMetadata } from "./page";
import { fetchPublishedPage } from "@/shared/api/pages-server";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";

const fetchPage = fetchPublishedPage as jest.MockedFunction<
  typeof fetchPublishedPage
>;
const fetchSeo = fetchSeoSettings as jest.MockedFunction<
  typeof fetchSeoSettings
>;

function makePage(overrides: Partial<PageEntity> = {}): PageEntity {
  return {
    id: "p1",
    slug: "dostavka-ta-oplata",
    title: "Доставка та оплата",
    content: "<p>Умови доставки Новою Поштою по всій Україні.</p>",
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

const runMeta = (slug = "dostavka-ta-oplata") =>
  generateMetadata({ params: Promise.resolve({ slug }) });

afterEach(() => jest.clearAllMocks());

describe("legal/[slug] generateMetadata (TASK-268 review)", () => {
  it("brands a blank-meta page title with the %s template and derives the description", async () => {
    fetchPage.mockResolvedValue(
      makePage({ excerpt: "Умови доставки Новою Поштою." }),
    );
    fetchSeo.mockResolvedValue(settings);

    const meta = await runMeta();

    // Tier-3 derived title → branded via the default `%s | MobileStore` template.
    expect(meta.title).toEqual({
      absolute: "Доставка та оплата | MobileStore",
    });
    // Description derived from the excerpt (tier 3), not omitted like before.
    expect(meta.description).toBe("Умови доставки Новою Поштою.");
    expect(meta.alternates?.canonical).toBe(
      "http://localhost:3000/legal/dostavka-ta-oplata",
    );
  });

  it("uses a page's own metaTitle verbatim (absolute, unbranded)", async () => {
    fetchPage.mockResolvedValue(
      makePage({
        metaTitle: "Доставка Новою Поштою — MobileStore",
        metaDescription: "Все про доставку.",
      }),
    );
    fetchSeo.mockResolvedValue(settings);

    const meta = await runMeta();

    expect(meta.title).toEqual({
      absolute: "Доставка Новою Поштою — MobileStore",
    });
    expect(meta.description).toBe("Все про доставку.");
  });

  it("truncates a long derived title at a word boundary before branding", async () => {
    const longTitle =
      "Умови доставки та оплати замовлень Новою Поштою і кур'єром по всій території України";
    fetchPage.mockResolvedValue(makePage({ title: longTitle }));
    fetchSeo.mockResolvedValue(null); // settings unavailable → default template still applies

    const meta = await runMeta();

    const absolute = (meta.title as { absolute: string }).absolute;
    expect(absolute.endsWith(" | MobileStore")).toBe(true);
    const derivedPart = absolute.replace(" | MobileStore", "");
    expect(derivedPart.length).toBeLessThanOrEqual(61); // 60 + ellipsis
    expect(derivedPart.endsWith("…")).toBe(true);
  });

  it("falls back to the page fallback title when the page is missing", async () => {
    fetchPage.mockResolvedValue(null);
    fetchSeo.mockResolvedValue(settings);

    const meta = await runMeta("nope");

    expect(meta.title).toBeDefined();
    expect(typeof meta.title).toBe("string");
  });
});
