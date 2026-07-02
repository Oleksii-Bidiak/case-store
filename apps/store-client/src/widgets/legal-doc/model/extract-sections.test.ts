import { extractDocSections, formatLegalDate } from "./extract-sections";

describe("extractDocSections", () => {
  it("injects sequential ids and collects heading labels in order", () => {
    const { html, sections } = extractDocSections(
      "<p>intro</p><h2>Перший</h2><p>a</p><h2>Другий</h2>",
    );

    expect(sections).toEqual([
      { id: "sec-0", label: "Перший" },
      { id: "sec-1", label: "Другий" },
    ]);
    expect(html).toContain('<h2 id="sec-0">Перший</h2>');
    expect(html).toContain('<h2 id="sec-1">Другий</h2>');
  });

  it("strips inline tags from the label and replaces any existing id", () => {
    const { html, sections } = extractDocSections(
      '<h2 id="old" class="x"><b>Bold</b> текст</h2>',
    );

    expect(sections).toEqual([{ id: "sec-0", label: "Bold текст" }]);
    expect(html).toContain('class="x"');
    expect(html).toContain('id="sec-0"');
    expect(html).not.toContain('id="old"');
  });

  it("returns no sections and the original html when there are no headings", () => {
    const input = "<p>Just a paragraph.</p>";
    expect(extractDocSections(input)).toEqual({ html: input, sections: [] });
  });
});

describe("formatLegalDate", () => {
  it("formats an ISO date as a Ukrainian long date", () => {
    // No trailing "Z" → parsed as local time, so the day never shifts by TZ.
    expect(formatLegalDate("2026-06-12T00:00:00")).toBe("12 червня 2026");
  });

  it("returns the input unchanged when it is not a valid date", () => {
    expect(formatLegalDate("not-a-date")).toBe("not-a-date");
  });
});
