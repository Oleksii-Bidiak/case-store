import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SeoSettingsEntity } from "@/shared/api/generated/models";

// Isolate generateMetadata from the React tree (plan 145 / TASK-279-B), mirror
// of legal/[slug]/page.test.ts: mock the server fetchers and every component
// the module pulls in; resolveSeo / resolveTitleTemplate run for real so the
// test pins the actual tiering behavior.
jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn(),
  SEO_SETTINGS_TAG: "seo-settings",
}));
jest.mock("@/shared/api/banners-server", () => ({
  fetchPublishedBanners: jest.fn().mockResolvedValue({ ANNOUNCEMENT_BAR: [] }),
  BANNERS_COLLECTION_TAG: "banners",
}));
jest.mock("@/widgets/header", () => ({ Header: () => null }));
jest.mock("@/widgets", () => ({ Footer: () => null }));
jest.mock("./providers", () => ({ Providers: () => null }));
// next/font/google is a build-time macro (compiled away by Next's SWC plugin);
// under plain ts-jest the runtime module throws, so stub the three loaders.
jest.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
  Sora: () => ({ variable: "--font-sora" }),
}));
jest.mock("next/script", () => ({ __esModule: true, default: () => null }));
// Plain CSS import — ts-jest cannot parse it; generateMetadata never needs it.
jest.mock("./globals.css", () => ({}));

import { generateMetadata } from "./layout";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import {
  BRAND_OG_IMAGE_HEIGHT,
  BRAND_OG_IMAGE_PATH,
  BRAND_OG_IMAGE_WIDTH,
  dict,
  SITE_NAME,
} from "@/shared/config";

const fetchSeo = fetchSeoSettings as jest.MockedFunction<
  typeof fetchSeoSettings
>;

function makeSettings(
  overrides: Partial<SeoSettingsEntity> = {},
): SeoSettingsEntity {
  return {
    id: "00000000-0000-0000-0000-000000000002",
    defaultMetaTitle: null,
    defaultMetaDescription: null,
    titleTemplate: null,
    defaultOgImage: null,
    googleSiteVerification: null,
    bingSiteVerification: null,
    noindexSite: false,
    llmsTxtSummary: null,
    additionalSameAsLinks: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const brandFallbackImages = [
  {
    url: BRAND_OG_IMAGE_PATH,
    width: BRAND_OG_IMAGE_WIDTH,
    height: BRAND_OG_IMAGE_HEIGHT,
    alt: dict.meta.brandCardAlt(SITE_NAME),
  },
];

afterEach(() => jest.clearAllMocks());

describe("root layout generateMetadata (TASK-279)", () => {
  it("falls back to the branded OG card when SeoSettings is unavailable", async () => {
    fetchSeo.mockResolvedValue(null);

    const meta = await generateMetadata();

    expect(meta.openGraph?.images).toEqual(brandFallbackImages);
  });

  it("falls back to the branded OG card when defaultOgImage is null", async () => {
    fetchSeo.mockResolvedValue(makeSettings({ defaultOgImage: null }));

    const meta = await generateMetadata();

    expect(meta.openGraph?.images).toEqual(brandFallbackImages);
  });

  it("names the brand card after the admin-managed store name (TASK-546)", async () => {
    fetchSeo.mockResolvedValue(makeSettings({ siteName: "Аксесуарня" }));

    const meta = await generateMetadata();

    expect(meta.openGraph?.images).toEqual([
      {
        ...brandFallbackImages[0],
        alt: dict.meta.brandCardAlt("Аксесуарня"),
      },
    ]);
  });

  it("uses the admin defaultOgImage verbatim, without mixing in the fallback", async () => {
    fetchSeo.mockResolvedValue(
      makeSettings({ defaultOgImage: "https://cdn.example/x.png" }),
    );

    const meta = await generateMetadata();

    // Sized as the 1200×630 card it is uploaded for, with an alt (TASK-568).
    expect(meta.openGraph?.images).toEqual([
      {
        url: "https://cdn.example/x.png",
        width: 1200,
        height: 630,
        alt: expect.any(String),
      },
    ]);
  });

  it("brands the zero-config root title when SeoSettings is unavailable", async () => {
    fetchSeo.mockResolvedValue(null);

    const meta = await generateMetadata();

    const title = meta.title as { default: string; template: string };
    expect(title.default.startsWith("CaseStore —")).toBe(true);
    expect(title.default).toBe(dict.meta.rootTitle);
  });

  it("keeps the admin defaultMetaTitle winning over the branded fallback", async () => {
    fetchSeo.mockResolvedValue(
      makeSettings({ defaultMetaTitle: "Кастомний заголовок з адмінки" }),
    );

    const meta = await generateMetadata();

    const title = meta.title as { default: string };
    expect(title.default).toBe("Кастомний заголовок з адмінки");
  });

  // --- Search-console verification (TASK-280, plan 146) --------------------

  it("omits the verification key entirely when SeoSettings is unavailable", async () => {
    fetchSeo.mockResolvedValue(null);

    const meta = await generateMetadata();

    expect(meta.verification).toBeUndefined();
  });

  it("omits the verification key entirely when both tokens are null", async () => {
    fetchSeo.mockResolvedValue(makeSettings());

    const meta = await generateMetadata();

    expect(meta.verification).toBeUndefined();
  });

  it("emits only verification.google when just the Google token is set", async () => {
    fetchSeo.mockResolvedValue(
      makeSettings({ googleSiteVerification: "G-TOKEN" }),
    );

    const meta = await generateMetadata();

    expect(meta.verification?.google).toBe("G-TOKEN");
    expect(meta.verification?.other).toBeUndefined();
  });

  it("emits only verification.other['msvalidate.01'] when just the Bing token is set", async () => {
    fetchSeo.mockResolvedValue(
      makeSettings({ bingSiteVerification: "B-TOKEN" }),
    );

    const meta = await generateMetadata();

    expect(meta.verification?.google).toBeUndefined();
    expect(meta.verification?.other).toEqual({ "msvalidate.01": "B-TOKEN" });
  });

  // --- Site-wide noindex kill switch (TASK-550) ----------------------------

  it("emits robots noindex,nofollow for every route when noindexSite is on", async () => {
    fetchSeo.mockResolvedValue(makeSettings({ noindexSite: true }));

    const meta = await generateMetadata();

    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("emits no robots key when noindexSite is off, leaving pages indexable", async () => {
    fetchSeo.mockResolvedValue(makeSettings({ noindexSite: false }));

    const meta = await generateMetadata();

    expect(meta).not.toHaveProperty("robots");
  });

  it("fails open (no robots key) when SeoSettings is unavailable", async () => {
    fetchSeo.mockResolvedValue(null);

    const meta = await generateMetadata();

    expect(meta).not.toHaveProperty("robots");
  });

  it("emits both verification keys simultaneously when both tokens are set", async () => {
    fetchSeo.mockResolvedValue(
      makeSettings({
        googleSiteVerification: "G-TOKEN",
        bingSiteVerification: "B-TOKEN",
      }),
    );

    const meta = await generateMetadata();

    expect(meta.verification?.google).toBe("G-TOKEN");
    expect(meta.verification?.other).toEqual({ "msvalidate.01": "B-TOKEN" });
  });
});

/**
 * TASK-550 — Next merges metadata SHALLOWLY: a page that returns its own
 * `robots` replaces the root layout's object wholesale. The root emits
 * `{ index: false, follow: false }` under `noindexSite`, so the kill switch holds
 * only while no route (or the shared listing helper that routes spread in) can
 * produce anything but `index: false`. Every existing child does exactly that —
 * pages without a `robots` key (the product page, the home page) simply inherit
 * the root's. This guard fails the moment someone writes an indexable robots
 * value — `index: true`, `index: someFlag`, or the string form
 * `robots: "index, follow"` — where it would silently punch through the flag.
 * If a route ever genuinely needs one, it has to read `noindexSite` itself.
 */
describe("page-level robots cannot re-enable indexing (TASK-550)", () => {
  const SRC_ROOT = join(__dirname, "..");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) {
        return [];
      }
      return [full];
    });
  const sources = [
    ...walk(join(SRC_ROOT, "app")),
    ...walk(join(SRC_ROOT, "shared", "lib", "seo")),
  ].map((file) => ({ file, code: readFileSync(file, "utf8") }));

  it("scans the metadata sources (sanity: the known noindex routes are found)", () => {
    const withRobots = sources.filter(({ code }) => /\brobots\s*:/.test(code));
    // verify-email, checkout, not-found, both order pages, search, the layout,
    // three listing routes and the listing helper.
    expect(withRobots.length).toBeGreaterThan(5);
  });

  it("no source sets `index` to anything but false", () => {
    const indexable = /\bindex\s*:\s*(?!false\b|boolean\b)\S/;
    const offenders = sources
      .filter(({ code }) => indexable.test(code))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("no source uses the string form of `robots`", () => {
    const stringRobots = /\brobots\s*:\s*["'`]/;
    const offenders = sources
      .filter(({ code }) => stringRobots.test(code))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });
});
