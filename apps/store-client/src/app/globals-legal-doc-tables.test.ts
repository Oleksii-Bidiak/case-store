import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contract test for the table rules of `.legal-doc-body` in globals.css
 * (TASK-548). The legal and info pages render admin-authored HTML through that
 * class, and the sanitizer lets tables through — before these rules a table
 * there rendered as browser default, a borderless grid of run-together text.
 * jsdom applies no stylesheet, so what is pinned here is that the rules exist,
 * cover every part of a table the sanitizer keeps, and take their colours from
 * the design tokens only.
 */

type Rule = { selectors: string[]; body: string };

/** Top-level `selectors { body }` rules — enough for the flat rules this file pins. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) {
    out.push({
      selectors: m[1]
        .split(",")
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean),
      body: m[2],
    });
  }
  return out;
}

const css = readFileSync(join(__dirname, "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const all = rules(css);

/** Every declaration body whose selector list names exactly this selector. */
const bodiesFor = (selector: string) =>
  all.filter((r) => r.selectors.includes(selector)).map((r) => r.body);

const declares = (selector: string, property: RegExp) =>
  bodiesFor(selector).some((body) => property.test(body));

describe("globals.css — .legal-doc-body styles tables (TASK-548)", () => {
  it("lays the table out full width and fixed, so a wide one cannot push the page sideways", () => {
    expect(declares(".legal-doc-body table", /width\s*:\s*100%/)).toBe(true);
    expect(declares(".legal-doc-body table", /table-layout\s*:\s*fixed/)).toBe(
      true,
    );
    expect(
      declares(".legal-doc-body table", /border-collapse\s*:\s*collapse/),
    ).toBe(true);
  });

  it.each([".legal-doc-body th", ".legal-doc-body td"])(
    "borders and pads %s with the border token",
    (selector) => {
      expect(
        declares(selector, /border\s*:\s*1px solid var\(--color-border\)/),
      ).toBe(true);
      expect(declares(selector, /padding\s*:/)).toBe(true);
      expect(declares(selector, /overflow-wrap\s*:\s*break-word/)).toBe(true);
    },
  );

  it("gives header cells the muted surface", () => {
    expect(
      declares(".legal-doc-body th", /background\s*:\s*var\(--color-muted\)/),
    ).toBe(true);
  });

  it("styles the parts the sanitizer now keeps — caption and tfoot", () => {
    expect(
      declares(
        ".legal-doc-body caption",
        /color\s*:\s*var\(--color-muted-foreground\)/,
      ),
    ).toBe(true);
    expect(declares(".legal-doc-body tfoot td", /font-weight\s*:/)).toBe(true);
  });

  it("takes the paragraph spacing out of cells", () => {
    expect(declares(".legal-doc-body td p", /margin\s*:\s*0/)).toBe(true);
    expect(declares(".legal-doc-body th p", /margin\s*:\s*0/)).toBe(true);
  });

  it("uses no raw colour in any table rule", () => {
    const tableRules = all.filter((r) =>
      r.selectors.some((s) =>
        /^\.legal-doc-body .*\b(table|caption|th|td|tfoot)\b/.test(s),
      ),
    );
    expect(tableRules.length).toBeGreaterThan(0);
    for (const rule of tableRules) {
      expect(rule.body).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    }
  });
});
