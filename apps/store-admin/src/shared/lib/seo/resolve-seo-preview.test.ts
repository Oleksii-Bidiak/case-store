import {
  resolveSeoPreviewTitle,
  resolveSeoPreviewDescription,
  resolveEffectiveTitleTemplate,
  applyTitleTemplate,
  stripFormatting,
  truncateAtWord,
  SEO_TITLE_MAX,
  SEO_DESCRIPTION_MAX,
} from "./resolve-seo-preview";

// These cases mirror the storefront's resolveSeo.test.ts so the admin SERP
// preview stays in behavioral parity with production `<head>` rendering. A
// manual edit that drifts one side from the other fails here immediately.

const BRAND = "MobileStore";
const template = resolveEffectiveTitleTemplate(null, BRAND); // "%s | MobileStore"

describe("resolve-seo-preview constants", () => {
  it("pins the storefront limits (60 / 155)", () => {
    expect(SEO_TITLE_MAX).toBe(60);
    expect(SEO_DESCRIPTION_MAX).toBe(155);
  });
});

describe("resolveSeoPreviewTitle — precedence", () => {
  it("tier 1: own entityTitle wins, used verbatim (trimmed)", () => {
    const r = resolveSeoPreviewTitle({
      entityTitle: "  Кастомний заголовок  ",
      defaultTitle: "Найкращі аксесуари",
      contentName: "iPhone 15 Case",
      titleTemplate: template,
    });
    expect(r).toEqual({ text: "Кастомний заголовок", tier: "own" });
  });

  it("tier 2: defaultTitle wins over content when own is blank (verbatim)", () => {
    const r = resolveSeoPreviewTitle({
      entityTitle: "   ",
      defaultTitle: "Найкращі аксесуари",
      contentName: "iPhone 15 Case",
      titleTemplate: template,
    });
    expect(r).toEqual({ text: "Найкращі аксесуари", tier: "default" });
  });

  it("tier 3: derived from content name, branded via the template", () => {
    const r = resolveSeoPreviewTitle({
      contentName: "iPhone 15 Case",
      titleTemplate: template,
    });
    expect(r).toEqual({
      text: "iPhone 15 Case | MobileStore",
      tier: "derived",
    });
  });

  it("tier 3: applies a custom template to the derived name", () => {
    const r = resolveSeoPreviewTitle({
      contentName: "Чохли",
      titleTemplate: resolveEffectiveTitleTemplate(
        "%s — MobileStore UA",
        BRAND,
      ),
    });
    expect(r).toEqual({ text: "Чохли — MobileStore UA", tier: "derived" });
  });

  it("empty: all three tiers blank → empty text/tier", () => {
    const r = resolveSeoPreviewTitle({ titleTemplate: template });
    expect(r).toEqual({ text: "", tier: "empty" });
  });

  it("strips formatting and truncates a derived title to ~60 chars at a word boundary", () => {
    const longName =
      "Apple iPhone 15 Pro Max Silicone Case with MagSafe Midnight Blue Edition";
    const r = resolveSeoPreviewTitle({
      contentName: longName,
      titleTemplate: "%s", // no branding, so we can measure the derived title alone
    });
    expect(r.tier).toBe("derived");
    expect(r.text.length).toBeLessThanOrEqual(SEO_TITLE_MAX + 1); // +1 for the ellipsis
    expect(r.text.endsWith("…")).toBe(true);
    expect(r.text).not.toContain("  ");
  });
});

describe("resolveSeoPreviewDescription — precedence", () => {
  it("tier 1: own entityDescription wins (trimmed)", () => {
    const r = resolveSeoPreviewDescription({
      entityDescription: "  Опис від адміна  ",
      defaultDescription: "Дефолт",
      contentDescription: "Похідний опис",
    });
    expect(r).toEqual({ text: "Опис від адміна", tier: "own" });
  });

  it("tier 2: defaultDescription wins over content", () => {
    const r = resolveSeoPreviewDescription({
      defaultDescription: "Магазин преміальних аксесуарів",
      contentDescription: "Похідний опис",
    });
    expect(r).toEqual({
      text: "Магазин преміальних аксесуарів",
      tier: "default",
    });
  });

  it("tier 3: derives from content, no template applied", () => {
    const r = resolveSeoPreviewDescription({
      contentDescription: "  Похідний опис товару  ",
    });
    expect(r).toEqual({ text: "Похідний опис товару", tier: "derived" });
  });

  it("strips HTML/markdown and truncates a derived description to ~155 chars", () => {
    const html =
      "<p>Надійний <strong>чохол</strong> із **захистом** кутів. </p>".repeat(
        8,
      );
    const r = resolveSeoPreviewDescription({ contentDescription: html });
    expect(r.tier).toBe("derived");
    expect(r.text.length).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX + 1);
    expect(r.text).not.toContain("<");
    expect(r.text).not.toContain("*");
    expect(r.text.endsWith("…")).toBe(true);
  });

  it("empty: no tier yields usable text", () => {
    expect(resolveSeoPreviewDescription({})).toEqual({
      text: "",
      tier: "empty",
    });
    expect(
      resolveSeoPreviewDescription({
        entityDescription: "  ",
        contentDescription: "",
      }),
    ).toEqual({ text: "", tier: "empty" });
  });
});

describe("stripFormatting (parity port)", () => {
  it("removes HTML tags and collapses whitespace", () => {
    expect(stripFormatting("<p>Hello   <b>world</b></p>")).toBe("Hello world");
  });

  it("reduces markdown links to their text and drops emphasis markers", () => {
    expect(
      stripFormatting("See [our guide](https://x.io) for **more** _tips_"),
    ).toBe("See our guide for more tips");
  });

  it("decodes the common HTML entities", () => {
    expect(stripFormatting("Tom &amp; Jerry &lt;3")).toBe("Tom & Jerry <3");
  });
});

describe("truncateAtWord (parity port)", () => {
  it("returns short text unchanged (trimmed)", () => {
    expect(truncateAtWord("  short text  ", 60)).toBe("short text");
  });

  it("cuts at the last word boundary and appends an ellipsis", () => {
    expect(truncateAtWord("the quick brown fox jumps over", 15)).toBe(
      "the quick brown…",
    );
  });

  it("trims dangling punctuation left by the cut", () => {
    expect(truncateAtWord("one, two, three, four", 10)).toBe("one, two…");
  });
});

describe("resolveEffectiveTitleTemplate / applyTitleTemplate", () => {
  it("uses the admin template when it contains exactly one %s token", () => {
    expect(resolveEffectiveTitleTemplate("%s — MyShop", BRAND)).toBe(
      "%s — MyShop",
    );
  });

  it("falls back to `%s | brand` when missing, blank, or without a %s token", () => {
    expect(resolveEffectiveTitleTemplate(null, BRAND)).toBe("%s | MobileStore");
    expect(resolveEffectiveTitleTemplate("   ", BRAND)).toBe(
      "%s | MobileStore",
    );
    expect(resolveEffectiveTitleTemplate("No token", BRAND)).toBe(
      "%s | MobileStore",
    );
  });

  it("falls back when the template has more than one %s token", () => {
    expect(resolveEffectiveTitleTemplate("%s %s", BRAND)).toBe(
      "%s | MobileStore",
    );
  });

  it("applies a template by replacing the %s token", () => {
    expect(applyTitleTemplate("%s | Brand", "Головна")).toBe("Головна | Brand");
  });
});
