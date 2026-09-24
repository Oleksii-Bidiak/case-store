import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contract test for the disabled state of the `shared/ui` controls (TASK-736).
 *
 * `disabled:opacity-50` over text that is already grey left it at ≈2.0:1
 * (`muted-foreground`) / ≈3.4:1 (`foreground`) — below the 4.5:1 that
 * docs/design-system.md §8 asks for text. The controls now paint the state
 * with explicit tokens (`bg-disabled` + `text-disabled-foreground`), so the
 * contrast is a property of the token values and can be computed here, for
 * each of the THREE token blocks in globals.css (light, dark-by-OS,
 * dark-by-choice). jsdom has no cascade; the rendered look is left to
 * screenshots.
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

const light = tokens(blockAfter(":root"));
// The first `@media (prefers-color-scheme: dark)` wraps the token block (the
// `dark` custom variant's own media branch comes later in the file).
const darkMedia = tokens(blockAfter("@media (prefers-color-scheme: dark)"));
const darkChosen = tokens(blockAfter(":root[data-theme='dark']"));

const THEMES: [string, Record<string, string>][] = [
  ["light", light],
  ["dark (OS preference)", darkMedia],
  ["dark (chosen)", darkChosen],
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
 * (button, input, textarea, select trigger); the page/card/popover a label,
 * ghost/link button or select item sits on; the `bg-muted` tab list.
 */
const SURFACES = ["disabled", "background", "card", "popover", "muted"];

describe("globals.css — disabled-state tokens (TASK-736)", () => {
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
  });

  it("both dark blocks carry the same disabled values (TASK-412 sync rule)", () => {
    expect(darkChosen.disabled).toBe(darkMedia.disabled);
    expect(darkChosen["disabled-foreground"]).toBe(
      darkMedia["disabled-foreground"],
    );
  });

  it("maps both tokens to utilities in @theme inline", () => {
    const theme = blockAfter("@theme inline");
    expect(theme).toMatch(/--color-disabled:\s*var\(--color-disabled\)/);
    expect(theme).toMatch(
      /--color-disabled-foreground:\s*var\(--color-disabled-foreground\)/,
    );
  });
});

const CONTROLS = ["button", "input", "textarea", "select", "tabs", "label"];

describe("shared/ui controls paint disabled with tokens, not opacity (TASK-736)", () => {
  it.each(CONTROLS)("%s.tsx", (name) => {
    const src = readFileSync(
      join(__dirname, "..", "shared", "ui", `${name}.tsx`),
      "utf8",
    );
    // Any disabled-flavoured variant (`disabled:`, `peer-disabled:`,
    // `data-[disabled]:`, `group-data-[disabled=true]:`) fading via opacity.
    expect(src).not.toMatch(/disabled[^\s"'`]*:opacity-/);
    expect(src).toMatch(/disabled[^\s"'`]*:text-disabled-foreground/);
  });
});
