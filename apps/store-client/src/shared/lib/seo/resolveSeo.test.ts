import {
  resolveSeo,
  resolveTitleTemplate,
  applyTitleTemplate,
  toMetadataTitle,
  stripFormatting,
  truncateAtWord,
  SEO_TITLE_MAX,
  SEO_DESCRIPTION_MAX,
  type ResolveSeoSettings,
} from "./resolveSeo";

const settings: ResolveSeoSettings = {
  defaultMetaTitle: "Найкращі аксесуари",
  defaultMetaDescription: "Магазин преміальних аксесуарів",
  defaultOgImage: "https://cdn.example.com/og.png",
};

describe("resolveSeo — title precedence", () => {
  it("tier 1: entity metaTitle wins over settings and content (absolute)", () => {
    const r = resolveSeo({
      entityTitle: "  Кастомний заголовок  ",
      settings,
      content: { name: "iPhone 15 Case" },
    });
    expect(r.title).toBe("Кастомний заголовок");
    expect(r.titleAbsolute).toBe(true);
  });

  it("tier 2: settings.defaultMetaTitle wins over content when no entity title (absolute)", () => {
    const r = resolveSeo({
      settings,
      content: { name: "iPhone 15 Case" },
    });
    expect(r.title).toBe("Найкращі аксесуари");
    expect(r.titleAbsolute).toBe(true);
  });

  it("tier 3: content name only fires when both higher tiers are absent (not absolute)", () => {
    const r = resolveSeo({
      settings: { ...settings, defaultMetaTitle: null },
      content: { name: "iPhone 15 Case" },
    });
    expect(r.title).toBe("iPhone 15 Case");
    expect(r.titleAbsolute).toBe(false);
  });

  it("treats a blank/whitespace entity title as absent and falls through", () => {
    const r = resolveSeo({
      entityTitle: "   ",
      settings: { ...settings, defaultMetaTitle: "   " },
      content: { name: "Чохли" },
    });
    expect(r.title).toBe("Чохли");
    expect(r.titleAbsolute).toBe(false);
  });

  it("returns an empty, non-absolute title when nothing is available", () => {
    const r = resolveSeo({});
    expect(r.title).toBe("");
    expect(r.titleAbsolute).toBe(false);
  });

  it("strips formatting and truncates a derived title to ~60 chars at a word boundary", () => {
    const longName =
      "Apple iPhone 15 Pro Max Silicone Case with MagSafe Midnight Blue Edition";
    const r = resolveSeo({ content: { name: longName } });
    expect(r.title.length).toBeLessThanOrEqual(SEO_TITLE_MAX + 1); // +1 for the ellipsis
    expect(r.title.endsWith("…")).toBe(true);
    expect(r.title).not.toContain("  ");
  });
});

describe("resolveSeo — description precedence", () => {
  it("tier 1: entity metaDescription wins over settings and content", () => {
    const r = resolveSeo({
      entityDescription: "Опис від адміна",
      settings,
      content: { description: "Похідний опис" },
    });
    expect(r.description).toBe("Опис від адміна");
  });

  it("tier 2: settings.defaultMetaDescription wins over content", () => {
    const r = resolveSeo({
      settings,
      content: { description: "Похідний опис" },
    });
    expect(r.description).toBe("Магазин преміальних аксесуарів");
  });

  it("tier 3: content description fires when both higher tiers are absent", () => {
    const r = resolveSeo({
      settings: { ...settings, defaultMetaDescription: null },
      content: { description: "  Похідний опис товару  " },
    });
    expect(r.description).toBe("Похідний опис товару");
  });

  it("strips HTML/markdown and truncates a derived description to ~155 chars", () => {
    const html =
      "<p>Надійний <strong>чохол</strong> із **захистом** кутів. </p>".repeat(
        8,
      );
    const r = resolveSeo({ content: { description: html } });
    expect(r.description).toBeDefined();
    expect(r.description!.length).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX + 1);
    expect(r.description).not.toContain("<");
    expect(r.description).not.toContain("*");
    expect(r.description!.endsWith("…")).toBe(true);
  });

  it("returns undefined description when no tier yields usable text", () => {
    expect(resolveSeo({}).description).toBeUndefined();
    expect(
      resolveSeo({ entityDescription: "  ", content: { description: "" } })
        .description,
    ).toBeUndefined();
  });
});

describe("resolveSeo — ogImage", () => {
  it("returns the settings default OG image, or undefined when unset", () => {
    expect(resolveSeo({ settings }).ogImage).toBe(
      "https://cdn.example.com/og.png",
    );
    expect(resolveSeo({}).ogImage).toBeUndefined();
    expect(
      resolveSeo({ settings: { ...settings, defaultOgImage: "  " } }).ogImage,
    ).toBeUndefined();
  });
});

describe("stripFormatting", () => {
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

describe("truncateAtWord", () => {
  it("returns short text unchanged (trimmed)", () => {
    expect(truncateAtWord("  short text  ", 60)).toBe("short text");
  });

  it("cuts at the last word boundary and appends an ellipsis", () => {
    const out = truncateAtWord("the quick brown fox jumps over", 15);
    expect(out).toBe("the quick brown…");
  });

  it("trims dangling punctuation left by the cut", () => {
    const out = truncateAtWord("one, two, three, four", 10);
    expect(out).toBe("one, two…");
  });
});

describe("resolveTitleTemplate / applyTitleTemplate", () => {
  it("uses the admin template when it contains a %s token", () => {
    expect(
      resolveTitleTemplate({ titleTemplate: "%s — MyShop" }, "Brand"),
    ).toBe("%s — MyShop");
  });

  it("falls back to `%s | siteName` when the template is missing, blank, or has no %s", () => {
    expect(resolveTitleTemplate(null, "Brand")).toBe("%s | Brand");
    expect(resolveTitleTemplate({ titleTemplate: "   " }, "Brand")).toBe(
      "%s | Brand",
    );
    expect(resolveTitleTemplate({ titleTemplate: "No token" }, "Brand")).toBe(
      "%s | Brand",
    );
  });

  it("applies a template by replacing the %s token", () => {
    expect(applyTitleTemplate("%s | Brand", "Головна")).toBe("Головна | Brand");
  });
});

describe("toMetadataTitle", () => {
  const opts = { siteName: "MobileStore", fallback: "Товари" };

  it("brands a derived (non-absolute) title with the default template", () => {
    expect(
      toMetadataTitle(
        { title: "Головна", titleAbsolute: false },
        { ...opts, settings: null },
      ),
    ).toEqual({ absolute: "Головна | MobileStore" });
  });

  it("brands a derived title with the admin's custom template when set", () => {
    expect(
      toMetadataTitle(
        { title: "Чохли", titleAbsolute: false },
        { ...opts, settings: { titleTemplate: "%s — MobileStore UA" } },
      ),
    ).toEqual({ absolute: "Чохли — MobileStore UA" });
  });

  it("uses an explicit admin override (absolute) verbatim, unbranded", () => {
    expect(
      toMetadataTitle(
        { title: "Мій точний заголовок", titleAbsolute: true },
        { ...opts, settings: null },
      ),
    ).toEqual({ absolute: "Мій точний заголовок" });
  });

  it("falls back to the hard fallback (then brands) when the resolved title is empty", () => {
    expect(
      toMetadataTitle(
        { title: "", titleAbsolute: false },
        { ...opts, settings: null },
      ),
    ).toEqual({ absolute: "Товари | MobileStore" });
  });
});

/**
 * Mirrors the category branch of `app/products/page.tsx` `generateMetadata()`
 * (plan 117 TASK-247): a `?categoryId=` view feeds the resolved category node's
 * admin SEO overrides into `resolveSeo` as tier-1 `entityTitle`/`entityDescription`,
 * then brands the result via `toMetadataTitle`. These assertions prove the
 * override now wins over the content-derived (name/description) fallback — the
 * gap TASK-247 closed by exposing the columns on the public category tree.
 */
describe("resolveSeo — category /products call-site (TASK-247)", () => {
  // The page passes the one full SeoSettings object to both resolveSeo (reads the
  // default* fields) and toMetadataTitle (reads titleTemplate), so the test's stub
  // carries both shapes just like the real generateMetadata call.
  const seo: ResolveSeoSettings & { titleTemplate: string | null } = {
    defaultMetaTitle: null,
    defaultMetaDescription: null,
    defaultOgImage: null,
    titleTemplate: null,
  };
  const opts = { settings: seo, siteName: "MobileStore", fallback: "Товари" };

  /** Replicates the page's category-branch title/description composition. */
  function categoryMetadata(node: {
    name: string;
    description: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
  }) {
    const seoMeta = resolveSeo({
      settings: seo,
      entityTitle: node.metaTitle,
      entityDescription: node.metaDescription,
      content: { name: node.name, description: node.description },
    });
    return {
      title: toMetadataTitle(seoMeta, opts),
      description: seoMeta.description ?? "Товари opис",
    };
  }

  it("tier 1: a category metaTitle wins over the content-derived name, used verbatim (unbranded)", () => {
    const meta = categoryMetadata({
      name: "Чохли для iPhone",
      description: "Похідний опис категорії",
      metaTitle: "Чохли для iPhone — офіційний магазин | MobileStore",
      metaDescription: "Адмінський опис для пошуку.",
    });

    expect(meta.title).toEqual({
      absolute: "Чохли для iPhone — офіційний магазин | MobileStore",
    });
    expect(meta.description).toBe("Адмінський опис для пошуку.");
  });

  it("tier 3: with no metaTitle the title falls back to the branded category name", () => {
    const meta = categoryMetadata({
      name: "Чохли для iPhone",
      description: "Похідний опис категорії",
      metaTitle: null,
      metaDescription: null,
    });

    // Derived (non-absolute) name → root template appends the brand.
    expect(meta.title).toEqual({ absolute: "Чохли для iPhone | MobileStore" });
    expect(meta.description).toBe("Похідний опис категорії");
  });
});
