import { isHttpUrl, optionalHttpUrl } from "./http-url";

describe("isHttpUrl (TASK-573)", () => {
  it.each(["https://cdn.ua/og.jpg", "http://cdn.ua/og.jpg"])(
    "accepts %s",
    (value) => {
      expect(isHttpUrl(value)).toBe(true);
    },
  );

  it.each([
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "ftp://cdn.ua/og.jpg",
    "og.jpg",
    "",
  ])("rejects %j", (value) => {
    expect(isHttpUrl(value)).toBe(false);
  });
});

describe("optionalHttpUrl", () => {
  const field = optionalHttpUrl("bad url");

  it("treats blank and missing as unset", () => {
    expect(field.parse("")).toBe("");
    expect(field.parse("   ")).toBe("");
    expect(field.parse(undefined)).toBeUndefined();
  });

  it("trims a valid URL", () => {
    expect(field.parse("  https://cdn.ua/og.jpg ")).toBe(
      "https://cdn.ua/og.jpg",
    );
  });

  it("reports the given message for a non-http scheme", () => {
    const result = field.safeParse("javascript:alert(1)");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("bad url");
  });
});
