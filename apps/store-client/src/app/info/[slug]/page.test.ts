import type {
  PageEntity,
  SeoSettingsEntity,
} from "@/shared/api/generated/models";

// Mock the two ISR-tagged server fetchers the route composes; everything else
// (resolveSeo / toMetadataTitle / SITE_NAME) runs for real, mirroring the
// /legal/[slug] test so both surfaces are pinned the same way.
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
// The default export imports the legal-doc widget, whose transitive
// `sanitize-html` → `isomorphic-dompurify` (bundled jsdom) cannot initialize in
// the node unit project. generateMetadata never touches it, so stub the barrel —
// including the hub constant the route passes down.
jest.mock("@/widgets/legal-doc", () => ({
  LegalDocView: () => null,
  INFO_DOC_HUB: { href: "/info", label: "", badge: "", otherHeading: "" },
}));
jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
jest.mock("@/shared/lib/slug-redirect", () => ({
  resolveSlugRedirectTarget: jest.fn(),
}));

import InfoDocPage, { generateMetadata } from "./page";
import { notFound, permanentRedirect } from "next/navigation";
import {
  fetchPublishedPage,
  fetchPublishedPageAnyKind,
} from "@/shared/api/pages-server";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { resolveSlugRedirectTarget } from "@/shared/lib/slug-redirect";
import { INFO_SLUG_INLINED_ON_HUB } from "@/shared/config";

const fetchPage = fetchPublishedPage as jest.MockedFunction<
  typeof fetchPublishedPage
>;
const fetchAnyKind = fetchPublishedPageAnyKind as jest.MockedFunction<
  typeof fetchPublishedPageAnyKind
>;
const fetchSeo = fetchSeoSettings as jest.MockedFunction<
  typeof fetchSeoSettings
>;
const resolveRedirect = resolveSlugRedirectTarget as jest.MockedFunction<
  typeof resolveSlugRedirectTarget
>;

function makePage(overrides: Partial<PageEntity> = {}): PageEntity {
  return {
    id: "p-info-1",
    slug: "about",
    kind: "INFO",
    title: "Про нас",
    content: "<p>Український магазин аксесуарів та Apple-техніки.</p>",
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
// The kind-less lookup only matters on the 404 path; default it to "no such row"
// so every other test keeps describing what it is actually about.
// The same for the ledger (TASK-566): clearAllMocks keeps implementations, so a
// redirect one test set up must not leak into the next.
beforeEach(() => {
  fetchAnyKind.mockResolvedValue(null);
  resolveRedirect.mockResolvedValue(null);
});

describe("info/[slug] generateMetadata (TASK-435)", () => {
  const runMeta = (slug = "about") =>
    generateMetadata({ params: Promise.resolve({ slug }) });

  it("canonicalizes onto /info/<slug> and brands the derived title", async () => {
    fetchPage.mockResolvedValue(
      makePage({
        slug: "dostavka",
        title: "Доставка",
        excerpt: "Як ми відправляємо замовлення.",
      }),
    );
    fetchSeo.mockResolvedValue(settings);

    const meta = await runMeta("dostavka");

    expect(meta.title).toEqual({ absolute: "Доставка | CaseStore" });
    expect(meta.description).toBe("Як ми відправляємо замовлення.");
    expect(meta.alternates?.canonical).toBe(
      "http://localhost:3000/info/dostavka",
    );
  });

  // The hub renders this one page inline, so its text lives at two addresses.
  // The route keeps working; it just concedes which one Google should index —
  // and the sitemap makes the matching concession (see sitemap.test.ts).
  it("points the inlined page's canonical at the hub, not at itself", async () => {
    fetchPage.mockResolvedValue(
      makePage({ excerpt: "Хто ми і чому нам можна довіряти." }),
    );
    fetchSeo.mockResolvedValue(settings);

    const meta = await runMeta(INFO_SLUG_INLINED_ON_HUB);

    expect(meta.alternates?.canonical).toBe("http://localhost:3000/info");
  });

  it("asks the API for an INFO page — a legal document must not answer here", async () => {
    fetchPage.mockResolvedValue(makePage());
    fetchSeo.mockResolvedValue(settings);

    await runMeta();

    expect(fetchPage).toHaveBeenCalledWith("about", "INFO");
  });

  it("falls back to the page fallback title when nothing resolves", async () => {
    fetchPage.mockResolvedValue(null);
    fetchSeo.mockResolvedValue(settings);

    const meta = await runMeta("nope");

    expect(typeof meta.title).toBe("string");
  });
});

describe("info/[slug] rendering + slug redirect", () => {
  const runPage = (slug: string) =>
    InfoDocPage({ params: Promise.resolve({ slug }) });

  it("requests the INFO kind for the document body too", async () => {
    fetchPage.mockResolvedValue(makePage());
    fetchSeo.mockResolvedValue(settings);

    await runPage("about");

    expect(fetchPage).toHaveBeenCalledWith("about", "INFO");
    expect(notFound).not.toHaveBeenCalled();
  });

  // The API 404s the mismatch, so the body is never rendered here — but the
  // address is not simply dead either: the row exists, at /legal/<slug>, and
  // that is where the request belongs (a kind switch moves a page without
  // touching its slug, and records nothing in the rename ledger).
  it("308s to /legal when the slug belongs to a legal document", async () => {
    fetchPage.mockResolvedValue(null);
    fetchAnyKind.mockResolvedValue(
      makePage({ slug: "privacy-policy", kind: "LEGAL" }),
    );

    await expect(runPage("privacy-policy")).rejects.toThrow(
      "NEXT_REDIRECT:/legal/privacy-policy",
    );

    expect(fetchPage).toHaveBeenCalledWith("privacy-policy", "INFO");
    expect(permanentRedirect).toHaveBeenCalledWith("/legal/privacy-policy");
  });

  it("404s a slug no published page of any kind carries", async () => {
    fetchPage.mockResolvedValue(null);
    fetchAnyKind.mockResolvedValue(null);
    resolveRedirect.mockResolvedValue(null);

    await expect(runPage("never-existed")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("permanently redirects a renamed slug within /info", async () => {
    fetchPage.mockResolvedValue(null);
    resolveRedirect.mockResolvedValue({ newSlug: "pro-nas", newScope: "INFO" });
    fetchAnyKind.mockImplementation(async (slug: string) =>
      slug === "pro-nas" ? makePage({ slug: "pro-nas", kind: "INFO" }) : null,
    );

    await expect(runPage("about-us")).rejects.toThrow(
      "NEXT_REDIRECT:/info/pro-nas",
    );

    // TASK-566: asked about the address in THIS route's kind.
    expect(resolveRedirect).toHaveBeenCalledWith("PAGE", "about-us", "INFO");
    expect(permanentRedirect).toHaveBeenCalledWith("/info/pro-nas");
  });

  // A ledger row written before TASK-566 carried no kind and answered every
  // page route; the migration kept that by copying it into both kinds. Such a
  // renamed LEGAL slug asked for under /info resolves through the row's own
  // kind — one honest hop to /legal, never a second /info address that 404s.
  it("sends a renamed LEGAL slug asked for under /info to its real address", async () => {
    fetchPage.mockResolvedValue(null);
    resolveRedirect.mockResolvedValue({
      newSlug: "delivery",
      newScope: "LEGAL",
    });
    fetchAnyKind.mockImplementation(async (slug: string) =>
      slug === "delivery"
        ? makePage({ slug: "delivery", kind: "LEGAL" })
        : null,
    );

    await expect(runPage("dostavka")).rejects.toThrow(
      "NEXT_REDIRECT:/legal/delivery",
    );

    expect(permanentRedirect).toHaveBeenCalledWith("/legal/delivery");
  });
});
