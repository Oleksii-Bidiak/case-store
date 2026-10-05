import { buildOgImages } from "./og-images";
import {
  BRAND_OG_IMAGE_HEIGHT,
  BRAND_OG_IMAGE_PATH,
  BRAND_OG_IMAGE_WIDTH,
  dict,
  SITE_NAME,
} from "@/shared/config";

const brandCard = {
  url: BRAND_OG_IMAGE_PATH,
  width: BRAND_OG_IMAGE_WIDTH,
  height: BRAND_OG_IMAGE_HEIGHT,
  // The zero-config name: no `siteName` passed → the `resolveSiteName` fallback.
  alt: dict.meta.brandCardAlt(SITE_NAME),
};

const ALT = "Чохол Spigen для iPhone 15 | CaseStore";

describe("buildOgImages (TASK-432, tiers extended by TASK-437/569, sized by TASK-568)", () => {
  it("prefers the admin's own pick for this row over every automatic image", () => {
    expect(
      buildOgImages({
        entityOgImage: "https://cdn.example.com/og/chosen.jpg",
        pageImage: "https://cdn.example.com/product-1.jpg",
        categoryImage: "https://cdn.example.com/category.jpg",
        defaultOgImage: "https://cdn.example.com/default-og.png",
        alt: ALT,
      }),
    ).toEqual([
      {
        url: "https://cdn.example.com/og/chosen.jpg",
        width: 1200,
        height: 630,
        alt: ALT,
      },
    ]);
  });

  it("prefers the page's own image when the row has no chosen card — unsized", () => {
    // A product photo's proportions are unknown; a wrong size is worse than none.
    expect(
      buildOgImages({
        pageImage: "https://cdn.example.com/product-1.jpg",
        categoryImage: "https://cdn.example.com/category.jpg",
        defaultOgImage: "https://cdn.example.com/default-og.png",
        alt: ALT,
      }),
    ).toEqual([{ url: "https://cdn.example.com/product-1.jpg", alt: ALT }]);
  });

  // TASK-569
  it("uses the category's own image before the store-wide default", () => {
    expect(
      buildOgImages({
        categoryImage: "https://cdn.example.com/category.jpg",
        defaultOgImage: "https://cdn.example.com/default-og.png",
        alt: "Чохли",
      }),
    ).toEqual([{ url: "https://cdn.example.com/category.jpg", alt: "Чохли" }]);
  });

  it("falls back to the admin default OG image, sized as the 1200×630 card", () => {
    expect(
      buildOgImages({
        defaultOgImage: "https://cdn.example.com/default-og.png",
        alt: ALT,
      }),
    ).toEqual([
      {
        url: "https://cdn.example.com/default-og.png",
        width: 1200,
        height: 630,
        alt: ALT,
      },
    ]);
  });

  it("gives every image an alt, the brand-card alt when the caller has none", () => {
    for (const images of [
      buildOgImages({ entityOgImage: "https://cdn.example/a.png" }),
      buildOgImages({ pageImage: "https://cdn.example/b.png", alt: "  " }),
      buildOgImages({ categoryImage: "https://cdn.example/c.png" }),
      buildOgImages({ defaultOgImage: "https://cdn.example/d.png" }),
      buildOgImages(),
    ]) {
      expect(images[0].alt).toBe(dict.meta.brandCardAlt(SITE_NAME));
    }
  });

  it("names the brand card and the alt floor after the store's resolved name (TASK-546)", () => {
    const expected = dict.meta.brandCardAlt("Аксесуарня");
    expect(buildOgImages({ siteName: "Аксесуарня" })).toEqual([
      { ...brandCard, alt: expected },
    ]);
    // The floor for a page that passes no title follows the name too…
    expect(
      buildOgImages({
        pageImage: "https://cdn.example/b.png",
        siteName: "Аксесуарня",
      })[0].alt,
    ).toBe(expected);
    // …while a page's own title still wins.
    expect(
      buildOgImages({
        siteName: "Аксесуарня",
        alt: ALT,
        pageImage: "https://cdn.example/b.png",
      })[0].alt,
    ).toBe(ALT);
    // Blank → the same fallback `resolveSiteName` uses.
    expect(buildOgImages({ siteName: "   " })).toEqual([brandCard]);
  });

  it("falls back to the committed brand card when nothing is set", () => {
    expect(buildOgImages()).toEqual([brandCard]);
    expect(buildOgImages({})).toEqual([brandCard]);
    expect(
      buildOgImages({
        entityOgImage: null,
        pageImage: null,
        categoryImage: null,
        defaultOgImage: null,
      }),
    ).toEqual([brandCard]);
  });

  it("keeps the brand card's own alt — it pictures the store, not the page", () => {
    expect(buildOgImages({ alt: ALT })).toEqual([brandCard]);
  });

  it("treats blank/whitespace-only values as absent", () => {
    expect(
      buildOgImages({
        entityOgImage: "  ",
        pageImage: "   ",
        categoryImage: " ",
        defaultOgImage: "   ",
      }),
    ).toEqual([brandCard]);
    expect(
      buildOgImages({
        entityOgImage: " ",
        pageImage: "https://cdn.example/x.png",
        alt: ALT,
      }),
    ).toEqual([{ url: "https://cdn.example/x.png", alt: ALT }]);
  });

  it("never returns an empty array — a preview is never image-less", () => {
    expect(buildOgImages({}).length).toBeGreaterThan(0);
  });
});
