import {
  PREVIEW_TOKEN_HEADER,
  publicReadInit,
  safeRelativePath,
  withPreviewHeader,
} from "./preview-token";

describe("publicReadInit (TASK-669)", () => {
  it("is exactly the tagged ISR read without a token", () => {
    expect(publicReadInit(["pages", "page:x"])).toEqual({
      next: { tags: ["pages", "page:x"] },
    });
    expect(publicReadInit(["pages"], null)).toEqual({
      next: { tags: ["pages"] },
    });
  });

  it("is no-store, untagged and carries the token header under a preview", () => {
    expect(publicReadInit(["pages"], "tok")).toEqual({
      cache: "no-store",
      headers: { [PREVIEW_TOKEN_HEADER]: "tok" },
    });
  });
});

describe("withPreviewHeader (TASK-669)", () => {
  it("returns the axios options untouched without a token", () => {
    const options = { timeout: 5000 };
    expect(withPreviewHeader(options, null)).toBe(options);
  });

  it("adds the token header, keeping the caller's options and headers", () => {
    expect(
      withPreviewHeader({ timeout: 5000, headers: { a: "1" } }, "tok"),
    ).toEqual({
      timeout: 5000,
      headers: { a: "1", [PREVIEW_TOKEN_HEADER]: "tok" },
    });
  });
});

describe("safeRelativePath — no open redirect (TASK-669)", () => {
  it.each(["/", "/products/case-1", "/legal/oferta?x=1", "/blog/a#b"])(
    "accepts the same-origin path %s",
    (path) => {
      expect(safeRelativePath(path)).toBe(path);
    },
  );

  it.each([
    null,
    undefined,
    "",
    "https://evil.example/",
    "//evil.example/path",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "products/relative",
    "/ok\r\nSet-Cookie: x=1",
    "/tab\tinside",
    "/a\\b",
  ])("rejects %p", (value) => {
    expect(safeRelativePath(value)).toBeNull();
  });
});
