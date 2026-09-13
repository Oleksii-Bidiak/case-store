import type { PageEntity } from "@/shared/api/generated/models";
import type { SeoSettingsEntity } from "@/shared/api/generated/models";

// Mock the two ISR-tagged server fetchers the route composes; everything else
// (resolveSeo / toMetadataTitle / SITE_NAME) runs for real so this pins the real
// tiering behavior, matching the product route's generateMetadata (TASK-268 review).
jest.mock("@/shared/api/pages-server", () => ({
  fetchPublishedPage: jest.fn(),
  // The kind-less read behind `resolvePageRedirect` — how a moved page is found.
  fetchPublishedPageAnyKind: jest.fn().mockResolvedValue(null),
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
// Next's notFound()/permanentRedirect() throw special signals; mock them with
// throwing jest.fn()s so the default-export tests can assert which one fired.
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

import LegalDocPage, { generateMetadata } from "./page";
import { notFound, permanentRedirect } from "next/navigation";
import {
  fetchPublishedPage,
  fetchPublishedPageAnyKind,
} from "@/shared/api/pages-server";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";

const resolveRedirect = resolveSlugRedirect as jest.MockedFunction<
  typeof resolveSlugRedirect
>;

const fetchPage = fetchPublishedPage as jest.MockedFunction<
  typeof fetchPublishedPage
>;
const fetchAnyKind = fetchPublishedPageAnyKind as jest.MockedFunction<
  typeof fetchPublishedPageAnyKind
>;
const fetchSeo = fetchSeoSettings as jest.MockedFunction<
  typeof fetchSeoSettings
>;

function makePage(overrides: Partial<PageEntity> = {}): PageEntity {
  return {
    id: "p1",
    slug: "dostavka-ta-oplata",
    kind: "LEGAL",
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
// The kind-less lookup only matters on the 404 path; default it to "no such row"
// so every other test keeps describing what it is actually about.
beforeEach(() => fetchAnyKind.mockResolvedValue(null));

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

describe("legal/[slug] slug-redirect (TASK-285)", () => {
  const runPage = (slug: string) =>
    LegalDocPage({ params: Promise.resolve({ slug }) });

  it("permanently redirects a renamed slug to its current address", async () => {
    fetchPage.mockResolvedValue(null); // dead slug — content fetch 404s
    resolveRedirect.mockResolvedValue("nova-adresa");
    fetchAnyKind.mockImplementation(async (slug: string) =>
      slug === "nova-adresa"
        ? makePage({ slug: "nova-adresa", kind: "LEGAL" })
        : null,
    );

    await expect(runPage("stara-adresa")).rejects.toThrow(
      "NEXT_REDIRECT:/legal/nova-adresa",
    );

    expect(resolveRedirect).toHaveBeenCalledWith("PAGE", "stara-adresa");
    expect(permanentRedirect).toHaveBeenCalledWith("/legal/nova-adresa");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("still 404s a dead slug with no redirect row (regression)", async () => {
    fetchPage.mockResolvedValue(null);
    resolveRedirect.mockResolvedValue(null);

    await expect(runPage("never-existed")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(notFound).toHaveBeenCalled();
  });

  // TASK-435 — /legal serves LEGAL pages and nothing else. The kind travels to
  // the API, which 404s a mismatch, so an INFO page (or a HUB row) can never be
  // rendered as a legal document at this address.
  it("asks the API for a LEGAL page, so /info content can never answer here", async () => {
    fetchPage.mockResolvedValue(makePage());
    fetchSeo.mockResolvedValue(settings);

    await runPage("dostavka-ta-oplata");

    expect(fetchPage).toHaveBeenCalledWith("dostavka-ta-oplata", "LEGAL");
  });

  // Changing a page's kind moves its URL without touching its slug, and the
  // rename ledger records nothing for that — before this, an indexed
  // /legal/<slug> simply died the moment an operator switched «Вид сторінки».
  it("308s to /info when the page was switched to the help surface", async () => {
    fetchPage.mockResolvedValue(null); // no LEGAL page under this slug any more
    fetchAnyKind.mockResolvedValue(makePage({ slug: "oplata", kind: "INFO" }));

    await expect(runPage("oplata")).rejects.toThrow(
      "NEXT_REDIRECT:/info/oplata",
    );

    expect(permanentRedirect).toHaveBeenCalledWith("/info/oplata");
    expect(notFound).not.toHaveBeenCalled();
    // The ledger has nothing to say about a kind change; don't waste the call.
    expect(resolveRedirect).not.toHaveBeenCalled();
  });

  it("sends the inlined help page to the hub it is canonical on", async () => {
    fetchPage.mockResolvedValue(null);
    fetchAnyKind.mockResolvedValue(makePage({ slug: "about", kind: "INFO" }));

    await expect(runPage("about")).rejects.toThrow("NEXT_REDIRECT:/info");

    expect(permanentRedirect).toHaveBeenCalledWith("/info");
  });

  it("404s a slug no published page of any kind carries", async () => {
    fetchPage.mockResolvedValue(null);
    fetchAnyKind.mockResolvedValue(null);
    resolveRedirect.mockResolvedValue(null);

    await expect(runPage("about")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(fetchPage).toHaveBeenCalledWith("about", "LEGAL");
  });

  it("never consults the redirect ledger when the page resolves", async () => {
    fetchPage.mockResolvedValue(makePage());
    fetchSeo.mockResolvedValue(settings);

    await runPage("dostavka-ta-oplata");

    expect(resolveRedirect).not.toHaveBeenCalled();
    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });
});
