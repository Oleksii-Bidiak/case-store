import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contract test for the scroll-lock / scrollbar-gutter rules in globals.css
 * (TASK-510). jsdom has no layout, so the zero-shift property itself can only be
 * measured in a real browser (Playwright: body width before vs. while an overlay
 * is open). What CAN be pinned here is the shape that makes the shift zero by
 * construction, so a well-meant "cleanup" cannot silently bring it back:
 *
 *  1. the gutter is reserved unconditionally — no exception while locked;
 *  2. every margin a lock puts on <body> is neutralized, with enough
 *     specificity to beat react-remove-scroll-bar's injected
 *     `body[data-scroll-locked] { margin-right: …px !important }`;
 *  3. that neutralizer only applies where the gutter actually exists.
 */

type Rule = { prelude: string; body: string };

/** Top-level `prelude { body }` blocks, with brace matching (handles @supports). */
function blocks(css: string): Rule[] {
  const out: Rule[] = [];
  let depth = 0;
  let start = 0;
  let open = -1;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      if (depth === 0) open = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        out.push({
          prelude: css.slice(start, open).trim(),
          body: css.slice(open + 1, i),
        });
        start = i + 1;
      }
    } else if (ch === ";" && depth === 0) {
      // Statement at-rules (`@import …;`, `@plugin …;`) have no block.
      start = i + 1;
    }
  }
  return out;
}

/** Normalizes whitespace so declarations compare regardless of formatting. */
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const css = readFileSync(join(__dirname, "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const topLevel = blocks(css);

describe("globals.css — scroll lock never shifts the page (TASK-510)", () => {
  it("reserves the scrollbar gutter on <html> unconditionally", () => {
    const gutterRules = topLevel.filter((r) =>
      /scrollbar-gutter\s*:/.test(r.body),
    );

    expect(gutterRules.map((r) => squash(r.prelude))).toEqual(["html"]);
    expect(squash(gutterRules[0].body)).toContain("scrollbar-gutter: stable;");
  });

  it("no longer drops the gutter while a lock is on", () => {
    // The old exception: gutter removed exactly when react-remove-scroll's
    // compensation measured 0 in Chrome — the page slid by the scrollbar width.
    expect(css).not.toMatch(/:has\(\s*body\[data-scroll-locked\]/);
  });

  it("neutralizes lock margins on <body>, only where the gutter is supported", () => {
    const supports = topLevel.filter(
      (r) => squash(r.prelude) === "@supports (scrollbar-gutter: stable)",
    );
    const inner = supports.flatMap((r) => blocks(r.body));
    const neutralizer = inner.find(
      (r) => squash(r.prelude) === "html body[data-scroll-locked]",
    );

    expect(neutralizer).toBeDefined();
    expect(squash(neutralizer!.body)).toContain("margin-right: 0 !important;");
  });

  it("does not neutralize lock margins where no gutter is reserved", () => {
    // A top-level (unguarded) neutralizer would zero the compensation in a
    // browser without scrollbar-gutter, where the lock really frees a
    // scrollbar's width and the compensation is correct.
    const unguarded = topLevel.filter((r) =>
      /body\[data-scroll-locked\]/.test(r.prelude),
    );

    expect(unguarded).toEqual([]);
  });
});
