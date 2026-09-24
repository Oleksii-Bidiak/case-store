import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contract test for the disabled state of the admin `shared/ui` controls
 * (TASK-735 — the admin half of the TASK-736 rule; the storefront has its twin).
 *
 * `disabled:opacity-50` over text that is already grey left it at ≈2.0:1
 * (`muted-foreground`) / ≈3.4:1 (`foreground`) — below the 4.5:1 text needs.
 * The controls now paint the state with explicit tokens (`bg-disabled` +
 * `text-disabled-foreground`), so the contrast is a property of the token
 * values and can be computed here, for both token blocks of the admin
 * globals.css (light, and dark by OS preference — the admin has no theme
 * toggle). jsdom has no cascade; the rendered look is left to screenshots.
 */

const css = readFileSync(join(__dirname, "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Body of the first `{…}` block that follows `marker`, brace-matched. */
function blockAfter(marker: string): string {
  const at = css.indexOf(marker);
  if (at < 0) throw new Error(`marker not found: ${marker}`);
  const open = css.indexOf("{", at + marker.length);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unbalanced block after ${marker}`);
}

function tokens(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

const THEMES: [string, Record<string, string>][] = [
  ["light", tokens(blockAfter(":root"))],
  ["dark", tokens(blockAfter("@media (prefers-color-scheme: dark)"))],
];

/** WCAG 2.x relative luminance / contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Surfaces disabled text actually lands on: the control's own `bg-disabled`
 * (button, input, textarea, select trigger, rich-text editor and its toolbar
 * buttons); the page/card/popover a label, ghost/link button or select item
 * sits on; the `bg-muted` tab list.
 */
const SURFACES = ["disabled", "background", "card", "popover", "muted"];

describe("admin globals.css — disabled-state tokens (TASK-735)", () => {
  describe.each(THEMES)("%s", (_name, t) => {
    it("defines both disabled tokens", () => {
      expect(t.disabled).toMatch(/^#[0-9a-f]{6}$/);
      expect(t["disabled-foreground"]).toMatch(/^#[0-9a-f]{6}$/);
    });

    it.each(SURFACES)(
      "text-disabled-foreground on %s is ≥ 4.5:1",
      (surface) => {
        expect(t[surface]).toBeDefined();
        expect(
          contrast(t["disabled-foreground"], t[surface]),
        ).toBeGreaterThanOrEqual(4.5);
      },
    );

    it("the checked checkbox's mark (`disabled` on `disabled-foreground`) is ≥ 4.5:1", () => {
      expect(
        contrast(t.disabled, t["disabled-foreground"]),
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("maps both tokens to utilities in @theme inline", () => {
    const theme = blockAfter("@theme inline");
    expect(theme).toMatch(/--color-disabled:\s*var\(--color-disabled\)/);
    expect(theme).toMatch(
      /--color-disabled-foreground:\s*var\(--color-disabled-foreground\)/,
    );
  });
});

const uiSource = (file: string) =>
  readFileSync(join(__dirname, "..", "shared", "ui", file), "utf8");

// Any disabled-flavoured variant (`disabled:`, `peer-disabled:`,
// `data-[disabled]:`, `group-data-[disabled=true]:`, `disabled:data-[…]:`).
const FADED = /disabled[^\s"'`]*:opacity-/;
const TOKEN_TEXT = /disabled[^\s"'`]*:text-disabled-foreground/;
const TOKEN_ANY = /disabled[^\s"'`]*:(?:bg|text|border)-disabled/;

describe("admin shared/ui controls paint disabled with tokens, not opacity (TASK-735)", () => {
  it.each(["button", "input", "textarea", "select", "tabs", "label"])(
    "%s.tsx",
    (name) => {
      const src = uiSource(`${name}.tsx`);
      expect(src).not.toMatch(FADED);
      expect(src).toMatch(TOKEN_TEXT);
    },
  );

  // Text-less controls: the state is carried by fill and border.
  it.each(["checkbox", "switch"])("%s.tsx", (name) => {
    const src = uiSource(`${name}.tsx`);
    expect(src).not.toMatch(FADED);
    expect(src).toMatch(TOKEN_ANY);
  });

  it("rich-text-editor.tsx fades neither the editor nor its toolbar", () => {
    const src = uiSource("rich-text-editor/rich-text-editor.tsx")
      // Comments may explain what used to be there.
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/\bopacity-\d/);
    expect(src).toMatch(TOKEN_TEXT);
    expect(src).toMatch(/"[^"]*\bbg-disabled text-disabled-foreground/);
  });
});
