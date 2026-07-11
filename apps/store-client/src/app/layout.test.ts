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
    alt: dict.meta.rootTitle,
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

  it("uses the admin defaultOgImage verbatim, without mixing in the fallback", async () => {
    fetchSeo.mockResolvedValue(
      makeSettings({ defaultOgImage: "https://cdn.example/x.png" }),
    );

    const meta = await generateMetadata();

    expect(meta.openGraph?.images).toEqual([
      { url: "https://cdn.example/x.png" },
    ]);
  });

  it("brands the zero-config root title when SeoSettings is unavailable", async () => {
    fetchSeo.mockResolvedValue(null);

    const meta = await generateMetadata();

    const title = meta.title as { default: string; template: string };
    expect(title.default.startsWith("MobileStore —")).toBe(true);
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
});
