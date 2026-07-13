// Mock the shared/ui barrel so importing the gallery module doesn't pull
// browser-only UI deps into the node test environment.
jest.mock("@/shared/ui", () => ({ ProductThumb: () => null }));

import type { ProductImageEntity } from "@/shared/api/generated/models";
import { altText } from "./product-image-gallery";

const image = (alt: ProductImageEntity["alt"]): ProductImageEntity => ({
  id: "img-1",
  url: "https://cdn.example.com/a.jpg",
  alt,
  sortOrder: 0,
  isPrimary: true,
});

describe("altText", () => {
  it("returns the image alt when it is a non-empty string", () => {
    expect(altText(image("Clear case front"), "Fallback")).toBe(
      "Clear case front",
    );
  });

  it("falls back when alt is null", () => {
    expect(altText(image(null), "Fallback")).toBe("Fallback");
  });

  it("falls back when alt is an empty string", () => {
    expect(altText(image(""), "Fallback")).toBe("Fallback");
  });
});
