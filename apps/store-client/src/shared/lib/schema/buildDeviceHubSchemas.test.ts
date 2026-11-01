import { buildDeviceHubSchemas } from "./buildDeviceHubSchemas";

const SITE = "https://shop.example";

function build(
  overrides: Partial<Parameters<typeof buildDeviceHubSchemas>[0]> = {},
) {
  return buildDeviceHubSchemas({
    siteUrl: SITE,
    model: { name: "iPhone 15 Pro", slug: "iphone-15-pro", brandName: "Apple" },
    groups: [
      { category: { name: "Чохли", slug: "cases" }, productCount: 44 },
      {
        category: { name: "Захисне скло", slug: "screen-protectors" },
        productCount: 23,
      },
    ],
    name: "Все для iPhone 15 Pro",
    description: "Опис",
    trail: [
      { name: "Головна", path: "/" },
      { name: "Пристрої", path: "/devices" },
      { name: "Все для iPhone 15 Pro" },
    ],
    groupName: (category, model) => `${category} для ${model}`,
    ...overrides,
  });
}

describe("buildDeviceHubSchemas", () => {
  it("describes the hub as a CollectionPage at /devices/<slug>", () => {
    const { collectionPage } = build();
    expect(collectionPage).toMatchObject({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Все для iPhone 15 Pro",
      url: `${SITE}/devices/iphone-15-pro`,
      inLanguage: "uk-UA",
      description: "Опис",
      about: [
        { "@type": "Thing", name: "iPhone 15 Pro" },
        { "@type": "Brand", name: "Apple" },
      ],
    });
  });

  it("never puts `brand` on the Thing — it is not a Thing property", () => {
    const { collectionPage } = build();
    const about = collectionPage.about as Record<string, unknown>[];
    for (const node of about) expect(node).not.toHaveProperty("brand");
  });

  it("lists every group as its compatibility landing, in page order", () => {
    const { collectionPage } = build();
    expect(collectionPage.mainEntity).toEqual({
      "@type": "ItemList",
      numberOfItems: 2,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Чохли для iPhone 15 Pro",
          url: `${SITE}/catalog/cases/iphone-15-pro`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Захисне скло для iPhone 15 Pro",
          url: `${SITE}/catalog/screen-protectors/iphone-15-pro`,
        },
      ],
    });
  });

  it("builds the BreadcrumbList from the visible trail, the last crumb = the hub", () => {
    const { breadcrumb } = build();
    expect(breadcrumb).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Головна", item: `${SITE}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Пристрої",
          item: `${SITE}/devices`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Все для iPhone 15 Pro",
          item: `${SITE}/devices/iphone-15-pro`,
        },
      ],
    });
  });

  it("leaves a path-less middle crumb (no index page yet) out of the BreadcrumbList", () => {
    const { breadcrumb } = build({
      trail: [
        { name: "Головна", path: "/" },
        { name: "Пристрої" },
        { name: "Все для iPhone 15 Pro" },
      ],
    });
    expect(breadcrumb.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Головна", item: `${SITE}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: "Все для iPhone 15 Pro",
        item: `${SITE}/devices/iphone-15-pro`,
      },
    ]);
  });

  it("omits an empty description and brand", () => {
    const { collectionPage } = build({
      description: undefined,
      model: { name: "Pixel 8", slug: "pixel-8", brandName: "" },
    });
    expect(collectionPage).not.toHaveProperty("description");
    expect(collectionPage.about).toEqual({ "@type": "Thing", name: "Pixel 8" });
  });
});
