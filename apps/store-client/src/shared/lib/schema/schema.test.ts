import { buildOrganizationSchema } from "./buildOrganizationSchema";
import { buildWebSiteSchema } from "./buildWebSiteSchema";
import { buildBreadcrumbSchema } from "./buildBreadcrumbSchema";
import { buildFaqPageSchema } from "./buildFaqPageSchema";
import { buildItemListSchema } from "./buildItemListSchema";
import { buildProductSchema } from "./buildProductSchema";
import type {
  PublicProductEntity,
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

  it("emits sameAs from configured social links, dropping blanks/nulls", () => {
    const schema = buildOrganizationSchema(SITE, "MobileStore", [
      "https://t.me/store",
      "",
      null,
      "   ",
      "https://instagram.com/store",
    ]);
    expect(schema.sameAs).toEqual([
      "https://t.me/store",
      "https://instagram.com/store",
    ]);
  });

  it("omits sameAs when no usable social links are configured", () => {
    expect(buildOrganizationSchema(SITE, "MobileStore").sameAs).toBeUndefined();
    expect(
      buildOrganizationSchema(SITE, "MobileStore", [null, "", "  "]).sameAs,
    ).toBeUndefined();
  });

  it("emits the uploaded store logo (TASK-299)", () => {
    const logo = "http://localhost:3001/uploads/branding/logo.svg";
    expect(buildOrganizationSchema(SITE, "MobileStore", [], logo).logo).toBe(
      logo,
    );
  });

  it("absolutizes a site-relative logo path against the site url", () => {
    expect(
      buildOrganizationSchema(SITE, "MobileStore", [], "/uploads/logo.webp")
        .logo,
    ).toBe(`${SITE}/uploads/logo.webp`);
  });

  it("omits logo when unset, blank or unparseable", () => {
    expect(buildOrganizationSchema(SITE, "MobileStore").logo).toBeUndefined();
    expect(
      buildOrganizationSchema(SITE, "MobileStore", [], null).logo,
    ).toBeUndefined();
    expect(
      buildOrganizationSchema(SITE, "MobileStore", [], "   ").logo,
    ).toBeUndefined();
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

describe("buildItemListSchema", () => {
  it("emits an ItemList with 1-based positions in input order", () => {
    const schema = buildItemListSchema([
      {
        name: "iPhone 15 Case",
        url: `${SITE}/products/iphone-15-case`,
        image: `${SITE}/images/case.jpg`,
      },
      { name: "USB-C Cable", url: `${SITE}/products/usb-c-cable` },
    ]);
    expect(schema["@type"]).toBe("ItemList");
    expect(schema["@context"]).toBe("https://schema.org");

    const items = schema.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      "@type": "ListItem",
      position: 1,
      item: {
        "@type": "Product",
        name: "iPhone 15 Case",
        url: `${SITE}/products/iphone-15-case`,
        image: `${SITE}/images/case.jpg`,
      },
    });
    expect(items[1]).toMatchObject({ position: 2 });
  });

  it("omits the image field entirely when absent (no undefined)", () => {
    const schema = buildItemListSchema([
      { name: "USB-C Cable", url: `${SITE}/products/usb-c-cable` },
    ]);

    const items = schema.itemListElement as Array<Record<string, unknown>>;
    const item = items[0].item as Record<string, unknown>;
    expect("image" in item).toBe(false);
  });

  it("yields an empty itemListElement for an empty input array", () => {
    const schema = buildItemListSchema([]);

    expect(schema.itemListElement).toEqual([]);
  });
});

describe("buildFaqPageSchema", () => {
  it("emits a FAQPage with a Question/acceptedAnswer per entry", () => {
    const schema = buildFaqPageSchema([
      {
        question: "Скільки коштує доставка?",
        answer: "Безкоштовно від 1000 ₴.",
      },
      { question: "Яка гарантія?", answer: "12–24 місяці." },
    ]);
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("FAQPage");

    const entities = schema.mainEntity as Array<Record<string, unknown>>;
    expect(entities).toHaveLength(2);
    expect(entities[0]).toMatchObject({
      "@type": "Question",
      name: "Скільки коштує доставка?",
      acceptedAnswer: { "@type": "Answer", text: "Безкоштовно від 1000 ₴." },
    });
  });

  it("drops entries with a blank question or answer", () => {
    const schema = buildFaqPageSchema([
      { question: "Питання?", answer: "Відповідь." },
      { question: "   ", answer: "Немає питання." },
      { question: "Немає відповіді?", answer: "  " },
    ]);
    const entities = schema.mainEntity as Array<Record<string, unknown>>;
    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({ name: "Питання?" });
  });

  it("emits an empty mainEntity array when there are no entries", () => {
    const schema = buildFaqPageSchema([]);
    expect(schema.mainEntity).toEqual([]);
  });
});

// ─── buildProductSchema ──────────────────────────────────────────────────────

const baseProduct: PublicProductEntity = {
  id: "p1",
  name: "iPhone 15 Case",
  slug: "iphone-15-case",
  description: "A sturdy clear case",
  price: "9.99",
  compareAtPrice: null,
  sku: "CASE-15-BLK",
  inStock: true,
  lowStock: false,
  categoryId: "c1",
  groupId: null,
  attributes: {},
  positionOrder: 0,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
  ratingAverage: null,
  ratingCount: 0,
  variantSummary: {
    groupId: null,
    variantCount: 1,
    priceFrom: "9.99",
    defaultVariantId: "p1",
    defaultVariantSlug: "iphone-15-case",
    defaultInStock: true,
    colors: [],
  },
  specs: [],
  highlights: [],
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

  // Descriptions are rich text since TASK-361; Schema.org `description` is
  // plain text, so the markup must be stripped rather than shipped to Google.
  it("strips markup out of a rich-text description", () => {
    const schema = buildProductSchema({
      product: {
        ...baseProduct,
        description:
          "<p>Протиударний чохол</p><ul><li>Матовий</li><li>MagSafe</li></ul>",
      },
      images: [],
      ...opts,
    });

    expect(schema.description).toBe("Протиударний чохол Матовий MagSafe");
  });

  it("omits the description when the rich text carries no words", () => {
    const schema = buildProductSchema({
      product: { ...baseProduct, description: "<p></p>" },
      images: [],
      ...opts,
    });

    expect(schema.description).toBeUndefined();
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
      product: { ...baseProduct, inStock: false, lowStock: false },
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

  it("emits aggregateRating from the approved-review summary", () => {
    const schema = buildProductSchema({
      product: { ...baseProduct, ratingAverage: 4.5, ratingCount: 12 },
      images: [],
      ...opts,
    });
    expect(schema.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.5,
      reviewCount: 12,
      bestRating: 5,
      worstRating: 1,
    });
  });

  it("omits aggregateRating when the product has no reviews", () => {
    const schema = buildProductSchema({
      product: baseProduct, // ratingCount: 0
      images: [],
      ...opts,
    });
    expect(schema.aggregateRating).toBeUndefined();
  });
});
