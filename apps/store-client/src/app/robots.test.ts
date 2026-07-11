import robots from "./robots";
import { SITE_URL } from "@/shared/config";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import type { SeoSettingsEntity } from "@/shared/api/generated/models";

jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn(),
}));

const mockFetchSeoSettings = fetchSeoSettings as jest.MockedFunction<
  typeof fetchSeoSettings
>;

const SERVICE_DISALLOW = [
  "/cart",
  "/checkout",
  "/orders",
  "/account",
  "/login",
  "/register",
  "/search",
];

const AI_CRAWLERS = ["GPTBot", "Google-Extended", "PerplexityBot", "ClaudeBot"];

describe("robots", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("normal mode (noindexSite off)", () => {
    beforeEach(() => {
      mockFetchSeoSettings.mockResolvedValue({
        noindexSite: false,
      } as SeoSettingsEntity);
    });

    it("emits exactly two rule blocks: * and the AI-crawler group", async () => {
      const result = await robots();

      expect(result.rules).toEqual([
        {
          userAgent: "*",
          allow: "/",
          disallow: SERVICE_DISALLOW,
        },
        {
          userAgent: AI_CRAWLERS,
          allow: "/",
          disallow: SERVICE_DISALLOW,
        },
      ]);
    });

    it("AI rule's disallow deep-equals the * rule's disallow (named groups don't inherit from *)", async () => {
      const result = await robots();
      const rules = result.rules as Array<{
        userAgent: string | string[];
        disallow?: string | string[];
      }>;

      const starRule = rules.find((r) => r.userAgent === "*");
      const aiRule = rules.find((r) => Array.isArray(r.userAgent));

      expect(starRule).toBeDefined();
      expect(aiRule).toBeDefined();
      expect(aiRule?.disallow).toEqual(starRule?.disallow);
    });

    it("links the sitemap", async () => {
      const result = await robots();
      expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    });
  });

  describe("noindexSite kill switch", () => {
    it("emits a single * disallow-all rule with no AI block and no sitemap", async () => {
      mockFetchSeoSettings.mockResolvedValue({
        noindexSite: true,
      } as SeoSettingsEntity);

      const result = await robots();

      // A single non-array `*` rule: AI bots have no matching named group and
      // fall back to `*` by spec, so they are blocked too.
      expect(result.rules).toEqual({
        userAgent: "*",
        disallow: "/",
      });
      expect(result).not.toHaveProperty("sitemap");
    });
  });

  describe("settings unavailable", () => {
    it("falls back to normal mode when fetchSeoSettings resolves null (its contract on any fetch error)", async () => {
      mockFetchSeoSettings.mockResolvedValue(null);

      const result = await robots();

      expect(Array.isArray(result.rules)).toBe(true);
      expect(result.rules).toHaveLength(2);
      expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    });
  });
});
