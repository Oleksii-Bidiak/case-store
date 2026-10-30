import { dict } from "./dictionary";
import { SITE_NAME } from "./site";

/**
 * Page `<title>` strings are bare page names (TASK-1628).
 *
 * The root layout's `title.template` (`resolveTitleTemplate`, default
 * `%s | ${siteName}`) brands every child segment's string title — a static
 * `metadata` export and a `generateMetadata` return alike. A dictionary title
 * that already ends in «| CaseStore» therefore renders the brand twice
 * («Кошик | CaseStore | CaseStore»), and it would also keep the constant after
 * the owner renames the store in /settings/seo. `rootTitle` is the exception:
 * it is `title.default`, which Next never templates, so it carries the brand.
 */
const SAMPLE_REF = "AB12CD34";

function metaTitles(): Array<[string, string]> {
  const entries = Object.entries(dict.meta).filter(
    ([key]) => key.endsWith("Title") && key !== "rootTitle",
  );
  const titles = entries.map(([key, value]): [string, string] => [
    `meta.${key}`,
    typeof value === "function"
      ? (value as (...args: string[]) => string)(SAMPLE_REF, SAMPLE_REF)
      : String(value),
  ]);
  return [...titles, ["wishlist.metaTitle", dict.wishlist.metaTitle]];
}

describe("storefront dictionary — page titles (TASK-1628)", () => {
  const titles = metaTitles();

  it("covers the account, auth, cart and order titles", () => {
    const keys = titles.map(([key]) => key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "meta.cartTitle",
        "meta.checkoutTitle",
        "meta.orderTitle",
        "meta.guestOrderTitle",
        "meta.orderLookupTitle",
        "meta.loginTitle",
        "meta.accountTitle",
        "meta.accountOrdersTitle",
        "meta.accountOrderTitle",
      ]),
    );
  });

  it.each(titles)(
    "%s leaves the store name to the title template",
    (_, title) => {
      expect(title).not.toContain(SITE_NAME);
      expect(title).not.toContain("|");
    },
  );

  it("keeps the order reference in the order titles", () => {
    expect(dict.meta.orderTitle(SAMPLE_REF)).toContain(SAMPLE_REF);
    expect(dict.meta.accountOrderTitle(SAMPLE_REF)).toContain(SAMPLE_REF);
  });
});
