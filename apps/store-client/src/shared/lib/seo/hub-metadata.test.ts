import type { SeoSettingsEntity } from "@/shared/api/generated/models";

jest.mock("@/shared/api/pages-server", () => ({
  fetchPublishedPage: jest.fn(),
}));
jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn(),
}));

import { buildHubMetadata } from "./hub-metadata";
import { fetchPublishedPage } from "@/shared/api/pages-server";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { SITE_NAME } from "@/shared/config";

const fetchPage = fetchPublishedPage as jest.MockedFunction<
  typeof fetchPublishedPage
>;
const fetchSeo = fetchSeoSettings as jest.MockedFunction<
  typeof fetchSeoSettings
>;

const settings = {
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
} as SeoSettingsEntity;

const describeStore = (siteName: string) => `Документи ${siteName}`;

afterEach(() => jest.clearAllMocks());

// TASK-1639 — a hub's dictionary description may name the store; it is then
// built from the admin-managed store name this helper already resolves.
describe("buildHubMetadata — a fallback description that names the store", () => {
  it("builds it from the admin-managed store name", async () => {
    fetchPage.mockResolvedValue(null);
    fetchSeo.mockResolvedValue({ ...settings, siteName: "Аксесуарня" });

    const meta = await buildHubMetadata({
      slug: "legal",
      canonical: "http://localhost:3000/legal",
      fallbackTitle: "Правова інформація",
      fallbackDescription: describeStore,
    });

    expect(meta.description).toBe("Документи Аксесуарня");
    expect(meta.openGraph?.description).toBe("Документи Аксесуарня");
  });

  it("falls back to the default store name when the settings are unavailable", async () => {
    fetchPage.mockResolvedValue(null);
    fetchSeo.mockResolvedValue(null);

    const meta = await buildHubMetadata({
      slug: "legal",
      canonical: "http://localhost:3000/legal",
      fallbackTitle: "Правова інформація",
      fallbackDescription: describeStore,
    });

    expect(meta.description).toBe(`Документи ${SITE_NAME}`);
  });

  it("still lets the hub row's own description win", async () => {
    fetchPage.mockResolvedValue({
      metaDescription: "Опис із панелі.",
    } as Awaited<ReturnType<typeof fetchPublishedPage>>);
    fetchSeo.mockResolvedValue({ ...settings, siteName: "Аксесуарня" });

    const meta = await buildHubMetadata({
      slug: "legal",
      canonical: "http://localhost:3000/legal",
      fallbackTitle: "Правова інформація",
      fallbackDescription: describeStore,
    });

    expect(meta.description).toBe("Опис із панелі.");
  });
});
