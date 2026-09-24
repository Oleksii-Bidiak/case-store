import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contract test for the element defaults in the admin globals.css (TASK-735,
 * the admin half; the storefront has its twin).
 *
 * An un-layered CSS rule beats every rule inside `@layer`, whatever the
 * specificity. With `* { border-color: var(--color-border) }` outside any
 * layer, every Tailwind `border-{colour}` utility (they live in
 * `@layer utilities`) was silently cancelled across the admin — an invalid
 * field had no red border, a focused control no ring-coloured border, a
 * checked checkbox no primary border. jsdom has no cascade, so the visible
 * effect is checked by screenshots; what CAN be pinned here is the shape:
 * element defaults sit in `@layer base`, never at top level.
 */

type Rule = { prelude: string; body: string };

/** Top-level `prelude { body }` blocks, with brace matching (handles @layer). */
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

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const css = readFileSync(join(__dirname, "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const topLevel = blocks(css);
const baseLayer = topLevel
  .filter((r) => squash(r.prelude) === "@layer base")
  .flatMap((r) => blocks(r.body));

// Preflight's own reset list — the pseudo-elements are not matched by `*`.
const BORDER_DEFAULT =
  "*, ::before, ::after, ::backdrop, ::file-selector-button";
const ELEMENT_DEFAULTS = [BORDER_DEFAULT, "body"];

describe("admin globals.css — element defaults live in @layer base (TASK-735)", () => {
  it.each(ELEMENT_DEFAULTS)("`%s` is not an un-layered rule", (selector) => {
    const unlayered = topLevel.filter((r) => squash(r.prelude) === selector);
    expect(unlayered).toEqual([]);
  });

  it.each(ELEMENT_DEFAULTS)(
    "`%s` is declared inside @layer base",
    (selector) => {
      expect(baseLayer.map((r) => squash(r.prelude))).toContain(selector);
    },
  );

  it("keeps the global border colour token inside the base layer", () => {
    const universal = baseLayer.find(
      (r) => squash(r.prelude) === BORDER_DEFAULT,
    );
    expect(squash(universal!.body)).toContain(
      "border-color: var(--color-border);",
    );
  });

  it("sets border-color in no un-layered element rule at all", () => {
    // Any top-level rule setting border-color would cancel the utilities again.
    // At-rule wrappers are skipped: `@layer` is the fix, `@theme`/`@media`
    // blocks only declare custom properties. `::-webkit-scrollbar*` rules
    // style a pseudo-element no utility targets, so they may stay un-layered.
    const offenders = topLevel.filter(
      (r) =>
        !r.prelude.startsWith("@") &&
        !r.prelude.includes("::-webkit-scrollbar") &&
        /(^|[;\s{])border-color\s*:/.test(r.body),
    );
    expect(offenders.map((r) => squash(r.prelude))).toEqual([]);
  });
});
