import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contract test for the fixed-bottom-bar reserve in globals.css (TASK-864).
 *
 * The cart / checkout `MobilePayBar` is `position: fixed` below `md`. A padding
 * on the page view only protects the page's own blocks — the site footer renders
 * after it, so at the end of the scroll the bar covered the footer's last row
 * (payment chips). The reserve therefore lives on <body>, after the footer, and
 * exists only while a bar is mounted. jsdom has no layout (and no `:has()`), so
 * the measurement itself is a browser check (qa-recheck SF-CART-23 / SF-CHK-33);
 * what is pinned here is the rule's shape.
 */

const css = readFileSync(join(__dirname, "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

describe("globals.css — room for a fixed bottom bar (TASK-864)", () => {
  const match = /body:has\(\[data-mobile-bar\]\)\s*\{([\s\S]*?\})\s*\}/.exec(
    css,
  );

  it("pads <body> while a bar marked data-mobile-bar is mounted", () => {
    expect(match).not.toBeNull();
  });

  it("reserves the room below md only, with a spacing token", () => {
    const body = squash(match![1]);
    expect(body).toMatch(/^@variant max-md \{/);
    expect(body).toContain("padding-bottom: --spacing(24);");
  });

  it("keeps the rule inside @layer base so utilities still win", () => {
    const layerStart = css.indexOf("@layer base {");
    const ruleAt = css.indexOf("body:has([data-mobile-bar])");
    expect(layerStart).toBeGreaterThanOrEqual(0);
    expect(ruleAt).toBeGreaterThan(layerStart);
    // The base block closes before the next top-level section (scrollbars).
    expect(ruleAt).toBeLessThan(css.indexOf("scrollbar-width: thin"));
  });
});
