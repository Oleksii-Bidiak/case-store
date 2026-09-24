import { GET } from "./route";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import type { SeoSettingsEntity } from "@/shared/api/generated/models";
import { SITE_URL } from "@/shared/config";

jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn(),
}));

const mockFetchSeoSettings = fetchSeoSettings as jest.MockedFunction<
  typeof fetchSeoSettings
>;

function settings(overrides: Partial<SeoSettingsEntity>): SeoSettingsEntity {
  return { noindexSite: false, ...overrides } as SeoSettingsEntity;
}

describe("GET /llms.txt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("serves the markdown map with the admin summary when noindexSite is off", async () => {
    mockFetchSeoSettings.mockResolvedValue(
      settings({ siteName: "Аксесуарня", llmsTxtSummary: "Кастомний опис" }),
    );

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(body.startsWith("# Аксесуарня\n")).toBe(true);
    expect(body).toContain("> Кастомний опис");
    expect(body).toContain(`${SITE_URL}/sitemap.xml`);
  });

  it("fails open (serves the map with the default intro) when the settings fetch returns null", async () => {
    mockFetchSeoSettings.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`${SITE_URL}/products`);
  });

  // TASK-550 — a map written for AI assistants to cite contradicts "keep this
  // deploy out of search", so it does not exist while the flag is on.
  it("answers an uncached, empty 404 when noindexSite is on", async () => {
    mockFetchSeoSettings.mockResolvedValue(
      settings({ noindexSite: true, llmsTxtSummary: "Кастомний опис" }),
    );

    const response = await GET();

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
