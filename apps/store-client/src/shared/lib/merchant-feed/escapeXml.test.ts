import { escapeXml } from "./escapeXml";

describe("escapeXml", () => {
  it("escapes all 5 XML-special characters", () => {
    expect(escapeXml(`A & B <tag> "q" 'q'`)).toBe(
      "A &amp; B &lt;tag&gt; &quot;q&quot; &apos;q&apos;",
    );
  });

  it("escapes & first so entities are not double-escaped", () => {
    expect(escapeXml("&lt;")).toBe("&amp;lt;");
    expect(escapeXml("&amp;")).toBe("&amp;amp;");
  });

  it("returns plain text untouched", () => {
    expect(escapeXml("Чохол для iPhone 15 Pro")).toBe(
      "Чохол для iPhone 15 Pro",
    );
  });

  it("returns an empty string for an empty string", () => {
    expect(escapeXml("")).toBe("");
  });

  it("escapes every occurrence, not just the first", () => {
    expect(escapeXml("a & b & c")).toBe("a &amp; b &amp; c");
    expect(escapeXml("<<>>")).toBe("&lt;&lt;&gt;&gt;");
  });
});
