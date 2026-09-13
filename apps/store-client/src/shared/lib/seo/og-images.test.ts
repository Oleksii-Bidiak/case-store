import { buildOgImages } from "./og-images";
import {
  BRAND_OG_IMAGE_HEIGHT,
  BRAND_OG_IMAGE_PATH,
  BRAND_OG_IMAGE_WIDTH,
  dict,
} from "@/shared/config";

const brandCard = {
  url: BRAND_OG_IMAGE_PATH,
  width: BRAND_OG_IMAGE_WIDTH,
  height: BRAND_OG_IMAGE_HEIGHT,
  alt: dict.meta.rootTitle,
};

describe("buildOgImages (TASK-432, tiers extended by TASK-437)", () => {
  it("prefers the admin's own pick for this row over every automatic image", () => {
    expect(
      buildOgImages({
        entityOgImage: "https://cdn.example.com/og/chosen.jpg",
        pageImage: "https://cdn.example.com/product-1.jpg",
        defaultOgImage: "https://cdn.example.com/default-og.png",
      }),
    ).toEqual([{ url: "https://cdn.example.com/og/chosen.jpg" }]);
  });

  it("prefers the page's own image when the row has no chosen card", () => {
    expect(
      buildOgImages({
        pageImage: "https://cdn.example.com/product-1.jpg",
        defaultOgImage: "https://cdn.example.com/default-og.png",
      }),
    ).toEqual([{ url: "https://cdn.example.com/product-1.jpg" }]);
  });

  it("falls back to the admin default OG image when the page has none", () => {
    expect(
      buildOgImages({
        defaultOgImage: "https://cdn.example.com/default-og.png",
      }),
    ).toEqual([{ url: "https://cdn.example.com/default-og.png" }]);
  });

  it("falls back to the committed brand card when nothing is set", () => {
    expect(buildOgImages()).toEqual([brandCard]);
    expect(buildOgImages({})).toEqual([brandCard]);
    expect(
      buildOgImages({
        entityOgImage: null,
        pageImage: null,
        defaultOgImage: null,
      }),
    ).toEqual([brandCard]);
  });

  it("treats blank/whitespace-only values as absent", () => {
    expect(
      buildOgImages({
        entityOgImage: "  ",
        pageImage: "   ",
        defaultOgImage: "   ",
      }),
    ).toEqual([brandCard]);
    expect(
      buildOgImages({
        entityOgImage: " ",
        pageImage: "https://cdn.example/x.png",
      }),
    ).toEqual([{ url: "https://cdn.example/x.png" }]);
  });

  it("never returns an empty array — a preview is never image-less", () => {
    expect(buildOgImages({}).length).toBeGreaterThan(0);
  });
});
