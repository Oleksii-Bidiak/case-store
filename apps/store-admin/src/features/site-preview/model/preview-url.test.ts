import { previewUrl } from "./preview-url";

describe("previewUrl (TASK-670)", () => {
  it("points at the storefront's /preview route with the token", () => {
    expect(previewUrl("abc", "https://shop.example")).toBe(
      "https://shop.example/preview?token=abc",
    );
  });

  it("does not double the slash when the origin ends with one", () => {
    expect(previewUrl("abc", "https://shop.example/")).toBe(
      "https://shop.example/preview?token=abc",
    );
  });

  it("encodes the token", () => {
    expect(previewUrl("a+b/c=", "https://shop.example")).toBe(
      "https://shop.example/preview?token=a%2Bb%2Fc%3D",
    );
  });
});
