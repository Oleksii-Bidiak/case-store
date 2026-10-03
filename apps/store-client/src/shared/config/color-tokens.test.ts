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

/**
 * Inline colour maths — `color-mix(…)` or a raw `oklch(…)` in a widget — is a
 * colour the theme layer does not know about. A tint is the token plus an
 * opacity modifier (`bg-primary/12`); a shared gradient is a token in
 * `globals.css` (`bg-brand-gradient`). The files below are tracked by a
 * backlog row and must keep at least one hit.
 */
const KNOWN_COLOUR_MATHS: Record<string, string> = {
  // Slide gradients built on white/black copy: waits for inverse tokens.
  "widgets/hero-banner/ui/hero-slider.tsx": "TASK-1678",
  // /promo hero gradient and the coupon chip tint (lane A files).
  "widgets/promo/ui/promo-view.tsx": "TASK-1685",
  "widgets/promo/ui/promo-coupons.tsx": "TASK-1685",
  // Per-hue placeholder covers, same family as product-gradient.ts.
  "widgets/blog/model/posts.ts": "TASK-1687",
  "widgets/categories/model/category-visuals.ts": "TASK-1687",
};

// The `\(` keeps prose in comments ("the old inline color-mix") out of the scan.
const COLOUR_MATHS = /\b(?:color-mix|oklch)\(/g;

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

function colourMathsHits(): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  for (const file of sourceFiles(SRC)) {
    const found = readFileSync(file, "utf8").match(COLOUR_MATHS);
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

  it("keeps the fixed account and homepage widgets off bg-white", () => {
    for (const file of [
      "widgets/account/ui/account-view.tsx",
      "widgets/account/ui/account-bonuses-section.tsx",
      "widgets/account/ui/account-settings-section.tsx",
      "widgets/hero-banner/ui/hero-category-sidebar.tsx",
      "widgets/hero-banner/ui/trust-strip.tsx",
    ]) {
      const source = readFileSync(join(SRC, file), "utf8");
      expect({ file, white: /\bbg-white\b/.test(source) }).toEqual({
        file,
        white: false,
      });
    }
  });

  it("does no colour maths (color-mix / raw oklch) outside the tracked files", () => {
    const offenders = [...colourMathsHits()]
      .filter(([file]) => !(file in KNOWN_COLOUR_MATHS))
      .map(([file, found]) => `${file}: ${found.join(", ")}`);
    expect(offenders).toEqual([]);
  });

  it("keeps every colour-maths file on the list only while it still needs it", () => {
    const hits = colourMathsHits();
    expect(hits.size).toBeGreaterThan(0);
    const fixed = Object.keys(KNOWN_COLOUR_MATHS).filter(
      (file) => !hits.has(file),
    );
    expect(fixed).toEqual([]);
  });
});
