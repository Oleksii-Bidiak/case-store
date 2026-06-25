import { buildOrganizationSchema } from "./buildOrganizationSchema";
import { buildWebSiteSchema } from "./buildWebSiteSchema";
import { buildBreadcrumbSchema } from "./buildBreadcrumbSchema";
import { buildProductSchema } from "./buildProductSchema";
import type {
  ProductEntity,
  ProductImageEntity,
} from "@/shared/api/generated/models";

const SITE = "https://example.com";

describe("buildOrganizationSchema", () => {
  it("emits an Organization node with name and url", () => {
    const schema = buildOrganizationSchema(SITE, "MobileStore");
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Organization");
    expect(schema.name).toBe("MobileStore");
    expect(schema.url).toBe(SITE);
  });
});

describe("buildWebSiteSchema", () => {
  it("emits a WebSite node with a SearchAction pointing at /products", () => {
    const schema = buildWebSiteSchema(SITE, "MobileStore");
    expect(schema["@type"]).toBe("WebSite");
    expect(schema.url).toBe(SITE);

    const action = schema.potentialAction as Record<string, unknown>;
    expect(action["@type"]).toBe("SearchAction");
    const target = action.target as Record<string, unknown>;
    expect(String(target.urlTemplate)).toContain("/products?search=");
    expect(action["query-input"]).toBe("required name=search_term_string");
  });
});

describe("buildBreadcrumbSchema", () => {
  it("emits a BreadcrumbList with 1-based positions in order", () => {
    const schema = buildBreadcrumbSchema([
      { name: "Home", item: SITE },
      { name: "Products", item: `${SITE}/products` },
      { name: "iPhone 15 Case", item: `${SITE}/products/iphone-15-case` },
    ]);
    expect(schema["@type"]).toBe("BreadcrumbList");

    const items = schema.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ position: 1, name: "Home", item: SITE });
    expect(items[2]).toMatchObject({
      position: 3,
      name: "iPhone 15 Case",
      item: `${SITE}/products/iphone-15-case`,
    });
  });
});

// ─── buildProductSchema ──────────────────────────────────────────────────────

const baseProduct: ProductEntity = {
  id: "p1",
  name: "iPhone 15 Case",
  slug: "iphone-15-case",
  description: "A sturdy clear case",
  price: "9.99",
  compareAtPrice: null,
  sku: "CASE-15-BLK",
  stock: 5,
  categoryId: "c1",
  groupId: null,
  attributes: {},
  positionOrder: 0,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
  ratingAverage: null,
  ratingCount: 0,
};

const image = (url: string, sortOrder = 0): ProductImageEntity => ({
  id: `img-${url}`,
  url,
  sortOrder,
  isPrimary: sortOrder === 0,
});

describe("buildProductSchema", () => {
  const opts = { siteUrl: SITE, currency: "UAH", brandName: "MobileStore" };

  it("emits a Product node with name, sku, description, brand and image array", () => {
    const schema = buildProductSchema({
      product: baseProduct,
      images: [image("https://cdn/x.jpg", 1), image("https://cdn/a.jpg", 0)],
      ...opts,
    });

    expect(schema["@type"]).toBe("Product");
    expect(schema.name).toBe("iPhone 15 Case");
    expect(schema.sku).toBe("CASE-15-BLK");
    expect(schema.description).toBe("A sturdy clear case");
    expect(schema.brand).toMatchObject({
      "@type": "Brand",
      name: "MobileStore",
    });
    // Images sorted by sortOrder.
    expect(schema.image).toEqual(["https://cdn/a.jpg", "https://cdn/x.jpg"]);
  });

  it("builds an InStock offer with currency and the position price", () => {
    const schema = buildProductSchema({
      product: baseProduct,
      images: [],
      ...opts,
    });
    const offer = schema.offers as Record<string, unknown>;
    expect(offer["@type"]).toBe("Offer");
    expect(offer.priceCurrency).toBe("UAH");
    expect(offer.price).toBe("9.99");
    expect(offer.url).toBe(`${SITE}/products/iphone-15-case`);
    expect(offer.availability).toBe("https://schema.org/InStock");
  });

  it("marks the offer OutOfStock when the position has zero stock", () => {
    const schema = buildProductSchema({
      product: { ...baseProduct, stock: 0 },
      images: [],
      ...opts,
    });
    const offer = schema.offers as Record<string, unknown>;
    expect(offer.availability).toBe("https://schema.org/OutOfStock");
  });

  it("omits sku when null and omits offers when no usable price", () => {
    const schema = buildProductSchema({
      product: { ...baseProduct, sku: null, price: "" },
      images: [],
      ...opts,
    });
    expect(schema.sku).toBeUndefined();
    expect(schema.offers).toBeUndefined();
  });
});
