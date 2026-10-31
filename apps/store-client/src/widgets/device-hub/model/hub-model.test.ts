import type {
  DeviceHubEntity,
  SeoSettingsEntity,
} from "@/shared/api/generated/models";
import { SITE_URL } from "@/shared/config";
import {
  buildHubLede,
  compatLandingPath,
  deviceHubTrail,
  ledeCategories,
  lowerFirst,
} from "./hub-copy";
import { buildDeviceHubMetadata } from "./hub-metadata";

function hub(overrides: Partial<DeviceHubEntity["model"]> = {}, groups = 4) {
  const names = [
    "Чохли",
    "Захисне скло та плівки",
    "Зарядні пристрої",
    "Кабелі",
  ];
  return {
    model: {
      id: "m1",
      name: "iPhone 15 Pro",
      slug: "iphone-15-pro",
      brandName: "Apple",
      brandSlug: "apple",
      series: "iPhone 15",
      metaTitle: null,
      metaDescription: null,
      description: null,
      ...overrides,
    },
    productCount: 128,
    groups: names.slice(0, groups).map((name, i) => ({
      category: { id: `c${i}`, name, slug: `cat-${i}` },
      productCount: 10,
      products: [],
    })),
  } as DeviceHubEntity;
}

describe("hub copy", () => {
  it("lower-cases a category's first letter but keeps acronyms and brands", () => {
    expect(lowerFirst("Захисне скло")).toBe("захисне скло");
    expect(lowerFirst("USB-кабелі")).toBe("USB-кабелі");
    expect(lowerFirst("MagSafe")).toBe("MagSafe");
    expect(lowerFirst("")).toBe("");
  });

  it("names the first three categories and adds «й решта» only when more follow", () => {
    expect(buildHubLede(hub())).toBe(
      "128 товарів, перевірених за моделлю: чохли, захисне скло та плівки, зарядні пристрої й решта. Усе тут підходить — нічого перевіряти не треба.",
    );
    expect(ledeCategories(hub({}, 3).groups).hasMore).toBe(false);
    expect(buildHubLede(hub({}, 3))).not.toContain("й решта");
  });

  it("links a group to its compatibility landing and the trail to /devices", () => {
    expect(compatLandingPath("cases", "iphone-15-pro")).toBe(
      "/catalog/cases/iphone-15-pro",
    );
    expect(deviceHubTrail("iPhone 15 Pro")).toEqual([
      { name: "Головна", path: "/" },
      { name: "Пристрої", path: "/devices" },
      { name: "Все для iPhone 15 Pro" },
    ]);
  });
});

describe("buildDeviceHubMetadata", () => {
  const seo = {
    siteName: "CaseStore",
    titleTemplate: null,
    defaultMetaTitle: null,
    defaultMetaDescription: null,
    defaultOgImage: null,
  } as unknown as SeoSettingsEntity;

  it("is self-canonical at /devices/<slug> with a generated, branded title", () => {
    const meta = buildDeviceHubMetadata(hub(), seo);
    expect(meta.title).toEqual({
      absolute: "Аксесуари для iPhone 15 Pro | CaseStore",
    });
    expect(meta.alternates).toEqual({
      canonical: `${SITE_URL}/devices/iphone-15-pro`,
    });
    expect(meta.description).toContain("чохли, захисне скло та плівки");
    expect(meta.description).toContain("128 товарів");
    expect(meta.robots).toBeUndefined();
    expect(meta.openGraph).toMatchObject({
      url: `${SITE_URL}/devices/iphone-15-pro`,
      locale: "uk_UA",
    });
  });

  it("uses the model's admin overrides verbatim", () => {
    const meta = buildDeviceHubMetadata(
      hub({ metaTitle: "Свій заголовок", metaDescription: "Свій опис" }),
      seo,
    );
    expect(meta.title).toEqual({ absolute: "Свій заголовок" });
    expect(meta.description).toBe("Свій опис");
  });

  it("returns only a fallback title when there is no hub", () => {
    expect(buildDeviceHubMetadata(null, seo)).toEqual({
      title: "Аксесуари для пристрою",
    });
  });
});
