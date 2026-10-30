import { dict } from "./dictionary";
import { SITE_NAME } from "./site";

/**
 * Copy that names the store is a function of the resolved store name
 * (TASK-1639), never the `SITE_NAME` literal.
 *
 * The owner renames the shop in /settings/seo (`SeoSettings.siteName`, read
 * through `resolveSiteName`). A string with «CaseStore» baked in keeps the old
 * name on the root title, the manifest, three hub descriptions, the legal hub
 * subtitle, the «Про нас» heading and the PDP warranty row after that rename.
 */
const CUSTOM = "Аксесуарня";

const copy: Array<[string, (siteName: string) => string]> = [
  ["meta.rootTitle", (name) => dict.meta.rootTitle(name)],
  [
    "meta.compatDescription",
    (name) => dict.meta.compatDescription("Чохли", "iPhone 15 Pro", name),
  ],
  ["meta.blogDescription", (name) => dict.meta.blogDescription(name)],
  ["meta.contactDescription", (name) => dict.meta.contactDescription(name)],
  ["legal.hub.subtitle", (name) => dict.legal.hub.subtitle(name)],
  ["info.aboutHeading", (name) => dict.info.aboutHeading(name)],
  [
    "product.buyBoxInfo.warranty.text",
    (name) => dict.product.buyBoxInfo.warranty.text(name),
  ],
  // TASK-1677 — the /blog hero and newsletter subtitles.
  ["blog.subtitle", (name) => dict.blog.subtitle(name)],
  ["blog.newsletter.subtitle", (name) => dict.blog.newsletter.subtitle(name)],
];

describe("storefront dictionary — copy that names the store (TASK-1639)", () => {
  it.each(copy)("%s carries the resolved store name", (_, build) => {
    const text = build(CUSTOM);
    expect(text).toContain(CUSTOM);
    expect(text).not.toContain(SITE_NAME);
  });

  it("keeps the compat description's category and device", () => {
    const text = dict.meta.compatDescription("Чохли", "iPhone 15 Pro", CUSTOM);
    expect(text).toContain("Чохли для iPhone 15 Pro");
  });
});
