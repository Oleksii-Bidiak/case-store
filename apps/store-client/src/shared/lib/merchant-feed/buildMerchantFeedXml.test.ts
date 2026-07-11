import {
  buildMerchantFeedXml,
  DESCRIPTION_MAX,
  type BuildMerchantFeedXmlInput,
  type MerchantFeedProduct,
} from "./buildMerchantFeedXml";

const SITE_URL = "https://mobilestore.com";
const SITE_NAME = "MobileStore";
const CURRENCY = "UAH";
const CHANNEL_DESCRIPTION = "Магазин аксесуарів для смартфонів";
const FALLBACK_DESCRIPTION = "Переглянути деталі товару.";

function makeProduct(
  overrides: Partial<MerchantFeedProduct> = {},
): MerchantFeedProduct {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "iPhone 15 Pro Case — Clear MagSafe",
    description: "Premium clear case with MagSafe support.",
    slug: "iphone-15-pro-case-clear-magsafe",
    price: "29.99",
    inStock: true,
    brand: { name: "Spigen" },
    primaryImage: { url: "https://cdn.example.com/images/product-1.jpg" },
    ...overrides,
  };
}

function build(
  products: MerchantFeedProduct[],
  overrides: Partial<BuildMerchantFeedXmlInput> = {},
): string {
  return buildMerchantFeedXml({
    products,
    siteUrl: SITE_URL,
    siteName: SITE_NAME,
    currency: CURRENCY,
    channelDescription: CHANNEL_DESCRIPTION,
    fallbackDescription: FALLBACK_DESCRIPTION,
    ...overrides,
  });
}

function countItems(xml: string): number {
  return (xml.match(/<item>/g) ?? []).length;
}

describe("buildMerchantFeedXml", () => {
  it("emits an RSS 2.0 document with the g: namespace and channel fields", () => {
    const xml = build([makeProduct()]);

    expect(xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`)).toBe(true);
    expect(xml).toContain(
      `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">`,
    );
    expect(xml).toContain(`<title>${SITE_NAME}</title>`);
    expect(xml).toContain(`<link>${SITE_URL}</link>`);
    expect(xml).toContain(`<description>${CHANNEL_DESCRIPTION}</description>`);
    expect(xml).toContain("</channel>");
    expect(xml).toContain("</rss>");
  });

  it("emits one fully-populated <item> per eligible product (Decisions 2–6)", () => {
    const xml = build([makeProduct()]);

    expect(countItems(xml)).toBe(1);
    expect(xml).toContain("<g:id>550e8400-e29b-41d4-a716-446655440000</g:id>");
    expect(xml).toContain("<title>iPhone 15 Pro Case — Clear MagSafe</title>");
    expect(xml).toContain(
      "<description>Premium clear case with MagSafe support.</description>",
    );
    expect(xml).toContain(
      `<link>${SITE_URL}/products/iphone-15-pro-case-clear-magsafe</link>`,
    );
    expect(xml).toContain(
      "<g:image_link>https://cdn.example.com/images/product-1.jpg</g:image_link>",
    );
    expect(xml).toContain("<g:price>29.99 UAH</g:price>");
    expect(xml).toContain("<g:availability>in_stock</g:availability>");
    expect(xml).toContain("<g:condition>new</g:condition>");
    expect(xml).toContain("<g:brand>Spigen</g:brand>");
    expect(xml).toContain("<g:identifier_exists>false</g:identifier_exists>");
  });

  it("pads Decimal-truncated prices back to N.NN (review follow-up)", () => {
    const xml = build([
      makeProduct({ price: "30" }),
      makeProduct({ id: "second", slug: "second", price: "29.9" }),
    ]);
    expect(xml).toContain("<g:price>30.00 UAH</g:price>");
    expect(xml).toContain("<g:price>29.90 UAH</g:price>");
  });

  it("maps inStock: false to out_of_stock", () => {
    const xml = build([makeProduct({ inStock: false })]);
    expect(xml).toContain("<g:availability>out_of_stock</g:availability>");
    expect(xml).not.toContain("<g:availability>in_stock</g:availability>");
  });

  it("falls back to siteName when brand is null (Decision 5)", () => {
    const xml = build([makeProduct({ brand: null })]);
    expect(xml).toContain(`<g:brand>${SITE_NAME}</g:brand>`);
  });

  it("falls back to fallbackDescription when description is null", () => {
    const xml = build([makeProduct({ description: null })]);
    expect(xml).toContain(`<description>${FALLBACK_DESCRIPTION}</description>`);
  });

  it("falls back to fallbackDescription when description strips to empty", () => {
    const xml = build([makeProduct({ description: "  ## ** __ " })]);
    expect(xml).toContain(`<description>${FALLBACK_DESCRIPTION}</description>`);
  });

  it("strips markdown/HTML formatting from the description (Decision 2)", () => {
    const xml = build([
      makeProduct({
        description:
          "**Bold** case with [link](https://spam.example) <b>tag</b>",
      }),
    ]);
    expect(xml).toContain("<description>Bold case with link tag</description>");
  });

  it("truncates very long descriptions at a word boundary within 5000 chars", () => {
    const longDescription = Array(1200).fill("слово").join(" "); // > 5000 chars
    const xml = build([makeProduct({ description: longDescription })]);

    const match = xml.match(/<description>([^<]*)<\/description>/g) ?? [];
    // [0] is the channel description, [1] the item's.
    const itemDescription = match[1]
      .replace("<description>", "")
      .replace("</description>", "");

    expect(itemDescription.length).toBeLessThanOrEqual(DESCRIPTION_MAX + 1); // +1 for the ellipsis
    expect(itemDescription.endsWith("…")).toBe(true);
    // No mid-word cut: strip the ellipsis and every remaining token must be intact.
    const tokens = itemDescription.slice(0, -1).split(" ");
    expect(tokens.every((t) => t === "слово")).toBe(true);
  });

  it("excludes products with no primaryImage, leaving other items intact (Decision 4)", () => {
    const xml = build([
      makeProduct({ id: "keep-1" }),
      makeProduct({ id: "drop-no-image", primaryImage: null }),
      makeProduct({ id: "keep-2" }),
    ]);

    expect(countItems(xml)).toBe(2);
    expect(xml).toContain("<g:id>keep-1</g:id>");
    expect(xml).toContain("<g:id>keep-2</g:id>");
    expect(xml).not.toContain("drop-no-image");
  });

  it.each([["abc"], ["-5"], [""], ["0"], ["  "]])(
    "excludes products whose price %j is not a finite positive number (Decision 4)",
    (price) => {
      const xml = build([makeProduct({ price })]);
      expect(countItems(xml)).toBe(0);
    },
  );

  it("emits a valid empty-channel document for an empty product list", () => {
    const xml = build([]);

    expect(countItems(xml)).toBe(0);
    expect(xml).toContain("<channel>");
    expect(xml).toContain(`<title>${SITE_NAME}</title>`);
    expect(xml).toContain("</channel>");
    expect(xml).toContain("</rss>");
  });

  it("escapes XML-special characters in name, description, and brand end-to-end", () => {
    const xml = build([
      makeProduct({
        name: `Cable & Charger <2m> "fast" 'new'`,
        description: `Supports 20W & "PD" <quick> charge`,
        brand: { name: "Baseus & Co" },
      }),
    ]);

    expect(xml).toContain(
      "<title>Cable &amp; Charger &lt;2m&gt; &quot;fast&quot; &apos;new&apos;</title>",
    );
    // stripFormatting eats < > " as markdown/HTML-ish markers is NOT the case for
    // quotes — but <quick> is treated as an HTML tag and stripped; assert the
    // ampersand + quotes escaping on what survives.
    expect(xml).toContain("<g:brand>Baseus &amp; Co</g:brand>");
    const item = xml.slice(xml.indexOf("<item>"), xml.indexOf("</item>"));
    expect(item).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it("escapes a raw & in link/image URLs (defense-in-depth, Decision 3)", () => {
    const xml = build([
      makeProduct({
        primaryImage: { url: "https://cdn.example.com/img.jpg?w=800&h=600" },
      }),
    ]);
    expect(xml).toContain(
      "<g:image_link>https://cdn.example.com/img.jpg?w=800&amp;h=600</g:image_link>",
    );
  });
});
