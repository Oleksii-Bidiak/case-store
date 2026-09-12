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

  // TASK-432 — deliberately inverted: before, the ONE store-wide default title
  // outranked every page's own name, so each product/category shipped the same
  // <title>. Content is more specific than a site-wide default, so it wins.
  it("tier 2: content name wins over settings.defaultMetaTitle when no entity title (not absolute)", () => {
    const r = resolveSeo({
      settings,
      content: { name: "iPhone 15 Case" },
    });
    expect(r.title).toBe("iPhone 15 Case");
    // Not absolute → the caller's template appends the brand.
    expect(r.titleAbsolute).toBe(false);
  });

  it("tier 3: settings.defaultMetaTitle only fires when there is no entity title AND no content (absolute)", () => {
    const r = resolveSeo({ settings, content: { name: "   " } });
    expect(r.title).toBe("Найкращі аксесуари");
    // Still an admin-typed string → used verbatim, no brand suffix appended.
    expect(r.titleAbsolute).toBe(true);
  });

  it("keeps the titleAbsolute mapping bound to the tier, not to the winner's rank", () => {
    // entity → verbatim; derived → branded; global default → verbatim.
    expect(resolveSeo({ entityTitle: "X", settings }).titleAbsolute).toBe(true);
    expect(
      resolveSeo({ settings, content: { name: "Чохли" } }).titleAbsolute,
    ).toBe(false);
    expect(resolveSeo({ settings }).titleAbsolute).toBe(true);
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

  // TASK-432 — deliberately inverted; see the title block above.
  it("tier 2: content description wins over settings.defaultMetaDescription", () => {
    const r = resolveSeo({
      settings,
      content: { description: "  Похідний опис товару  " },
    });
    expect(r.description).toBe("Похідний опис товару");
  });

  it("tier 3: settings.defaultMetaDescription fires only when the entity has no content of its own", () => {
    const r = resolveSeo({ settings, content: { description: "   " } });
    expect(r.description).toBe("Магазин преміальних аксесуарів");
  });

  /**
   * The requirement the owner actually reported (plan 176 «Навіщо»): with a
   * global default filled in, every product's <meta name="description"> read as
   * a description of the SHOP. The product's own text must win.
   */
  it("a product's own content beats the global defaultMetaDescription (the regression TASK-432 fixes)", () => {
    const r = resolveSeo({
      settings,
      content: {
        name: "Чохол Spigen Ultra Hybrid для iPhone 15",
        description:
          "Прозорий чохол із протиударними кутами та підтримкою MagSafe.",
      },
    });

    expect(r.description).toBe(
      "Прозорий чохол із протиударними кутами та підтримкою MagSafe.",
    );
    expect(r.description).not.toBe(settings.defaultMetaDescription);
    expect(r.title).toBe("Чохол Spigen Ultra Hybrid для iPhone 15");
    expect(r.title).not.toBe(settings.defaultMetaTitle);
  });

  it("an explicit entity override still outranks the entity's own content", () => {
    const r = resolveSeo({
      entityTitle: "Купити чохол Spigen — офіційний магазин",
      entityDescription: "Адмінський опис для пошуку.",
      settings,
      content: { name: "Чохол Spigen", description: "Похідний опис" },
    });
    expect(r.title).toBe("Купити чохол Spigen — офіційний магазин");
    expect(r.titleAbsolute).toBe(true);
    expect(r.description).toBe("Адмінський опис для пошуку.");
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
