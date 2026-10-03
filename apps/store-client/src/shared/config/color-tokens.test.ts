import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * TASK-879 — storefront colours come from the semantic tokens in `globals.css`
 * (design-system §2/§10), never from Tailwind's built-in palette
 * (`text-violet-500`, `bg-slate-900/60`, …). A palette hue ignores the theme and
 * says nothing about meaning.
 *
 * The files below still carry palette utilities on purpose or are tracked by a
 * backlog row; each entry must keep at least one hit, so the list shrinks when
 * a file is fixed.
 */
const SRC = join(__dirname, "..", "..");

const KNOWN: Record<string, string> = {
  // Decorative product placeholder gradients (no token set for them yet).
  "shared/lib/product-gradient.ts": "TASK-1687",
  // Rating stars are amber-400, which has no token yet.
  "shared/ui/rating-stars.tsx": "TASK-1687",
  "shared/ui/review-rating-stars.tsx": "TASK-1687",
  "features/submit-review/ui/submit-review-form.tsx": "TASK-1687",
  // Dark banners: an inverse / on-inverse token pair is planned.
  "widgets/hero-banner/ui/hero-slider.tsx": "TASK-1678",
  "widgets/promo-banner/ui/promo-banner.tsx": "TASK-1678",
};

const PALETTE =
  /\b(?:bg|text|border|ring|from|via|to|fill|stroke|outline|divide|shadow|decoration|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "generated" ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

function paletteHits(): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  for (const file of sourceFiles(SRC)) {
    const found = readFileSync(file, "utf8").match(PALETTE);
    if (found) hits.set(relative(SRC, file).replace(/\\/g, "/"), found);
  }
  return hits;
}

describe("colour tokens (TASK-879)", () => {
  it("uses no Tailwind palette colour outside the tracked files", () => {
    const offenders = [...paletteHits()]
      .filter(([file]) => !(file in KNOWN))
      .map(([file, found]) => `${file}: ${found.join(", ")}`);
    expect(offenders).toEqual([]);
  });

  it("keeps every tracked file on the list only while it still needs it", () => {
    const hits = paletteHits();
    // Guards the scan itself: a regex that matched nothing would pass vacuously.
    expect(hits.size).toBeGreaterThan(0);
    const fixed = Object.keys(KNOWN).filter((file) => !hits.has(file));
    expect(fixed).toEqual([]);
  });

  it("keeps the fixed account and homepage widgets free of inline colour maths", () => {
    for (const file of [
      "widgets/account/ui/account-view.tsx",
      "widgets/account/ui/account-bonuses-section.tsx",
      "widgets/account/ui/account-settings-section.tsx",
      "widgets/hero-banner/ui/hero-category-sidebar.tsx",
      "widgets/hero-banner/ui/trust-strip.tsx",
    ]) {
      const source = readFileSync(join(SRC, file), "utf8");
      expect({ file, colorMix: /color-mix\(/.test(source) }).toEqual({
        file,
        colorMix: false,
      });
      expect({ file, white: /\bbg-white\b/.test(source) }).toEqual({
        file,
        white: false,
      });
    }
  });
});
