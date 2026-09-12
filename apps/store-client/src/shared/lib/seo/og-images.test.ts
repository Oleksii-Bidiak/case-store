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

describe("buildOgImages (TASK-432)", () => {
  it("prefers the page's own image over everything else", () => {
    expect(
      buildOgImages({
        pageImage: "https://cdn.example.com/product-1.jpg",
        ogImage: "https://cdn.example.com/default-og.png",
      }),
    ).toEqual([{ url: "https://cdn.example.com/product-1.jpg" }]);
  });

  it("falls back to the admin default OG image when the page has none", () => {
    expect(
      buildOgImages({ ogImage: "https://cdn.example.com/default-og.png" }),
    ).toEqual([{ url: "https://cdn.example.com/default-og.png" }]);
  });

  it("falls back to the committed brand card when neither is set", () => {
    expect(buildOgImages()).toEqual([brandCard]);
    expect(buildOgImages({})).toEqual([brandCard]);
    expect(buildOgImages({ pageImage: null, ogImage: null })).toEqual([
      brandCard,
    ]);
  });

  it("treats blank/whitespace-only values as absent", () => {
    expect(buildOgImages({ pageImage: "   ", ogImage: "   " })).toEqual([
      brandCard,
    ]);
    expect(
      buildOgImages({ pageImage: " ", ogImage: "https://cdn.example/x.png" }),
    ).toEqual([{ url: "https://cdn.example/x.png" }]);
  });

  it("never returns an empty array — a preview is never image-less", () => {
    expect(buildOgImages({}).length).toBeGreaterThan(0);
  });
});
