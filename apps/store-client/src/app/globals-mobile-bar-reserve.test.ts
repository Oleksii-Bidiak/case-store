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

/**
 * TASK-1771 — the toaster clears the bar. `<Toaster clearMobileBar />` binds
 * sonner's bottom offsets to these two properties; a mounted bar publishes its
 * measured height as `--mobile-bar-inset`. The inset may be read below `md`
 * only — from `md` up the bar dissolves and desktop placement must not move.
 * The on-screen result (the toast above «Оформити замовлення» at 390) is a
 * browser check; the rules' shape is pinned here.
 */
describe("globals.css — toasts clear a fixed bottom bar (TASK-1771)", () => {
  // Whitespace-insensitive, including inside a wrapped `calc( … )`.
  const flat = squash(css).replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");

  it("keeps sonner's default offsets, on the spacing scale, at every width", () => {
    expect(flat).toContain(
      ":root { --toast-offset-bottom: --spacing(6); --toast-mobile-offset-bottom: --spacing(4); }",
    );
  });

  it("adds the published bar height below md only", () => {
    expect(flat).toContain(
      ":root { @variant max-md { --toast-offset-bottom: calc(--spacing(6) + var(--mobile-bar-inset, 0px)); --toast-mobile-offset-bottom: calc(--spacing(4) + var(--mobile-bar-inset, 0px)); } }",
    );
    // …and nowhere else: one read per offset, both inside that block.
    expect(flat.match(/var\(--mobile-bar-inset/g)).toHaveLength(2);
  });

  it("lives inside @layer base, after the body reserve", () => {
    const at = css.indexOf("--toast-offset-bottom: --spacing(6);");
    expect(at).toBeGreaterThan(css.indexOf("body:has([data-mobile-bar])"));
    expect(at).toBeLessThan(css.indexOf("scrollbar-width: thin"));
  });
});
