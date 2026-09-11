import { test, expect, type Page } from "./fixtures/test";

/**
 * Narrow-viewport regression (TASK-410): the storefront must never scroll
 * sideways on a phone.
 *
 * One invariant, asserted per route and per width:
 *
 *     document.documentElement.scrollWidth <= document.documentElement.clientWidth
 *
 * `clientWidth` already excludes a classic vertical scrollbar, so the check is
 * about page content alone and stays valid whether the runner draws overlay or
 * classic scrollbars. It is deliberately a whole-page assertion rather than a
 * per-component one: horizontal scroll is an emergent property (one
 * non-shrinking flex item, one `whitespace-nowrap` button, one fixed-width
 * panel), and unit tests cannot see it.
 *
 * Widths: 320 is the narrowest device still in the field (iPhone SE 1, small
 * Androids), 360 the most common Android, 390 the current iPhone. 390 also
 * matters because the header restores the wishlist/account actions exactly
 * there (`min-[390px]:`), so it is the first width where the action cluster is
 * at its widest.
 *
 * `page.setViewportSize` rather than a Playwright device project: the suite has
 * two projects (storefront, admin) and adding a third would double the run for
 * everything else. The viewport is set BEFORE `goto` so nothing is measured
 * against a desktop-width first paint.
 *
 * On failure the assertion message lists the elements sticking out past the
 * right edge — an overflow report is the difference between "some page is wide"
 * and a fixable selector. Elements inside a legitimately scrollable ancestor
 * (product rails, the filter sheet) are skipped: they are allowed to overflow
 * their own container, just not the document.
 */

/** Phone widths the storefront is expected to fit, in CSS pixels. */
const WIDTHS = [320, 360, 390] as const;

/** Tall enough that the routes below render their full layout, not a fold. */
const VIEWPORT_HEIGHT = 844;

/** Routes with a stable URL. The PDP is resolved from the catalog at runtime. */
const STATIC_ROUTES = ["/", "/products", "/cart"] as const;

interface OverflowReport {
  scrollWidth: number;
  clientWidth: number;
  offenders: string[];
}

/**
 * Measure the document and collect up to five elements whose right edge lies
 * past the viewport, for the failure message.
 */
async function measureOverflow(page: Page): Promise<OverflowReport> {
  return page.evaluate<OverflowReport>(() => {
    const root = document.documentElement;
    const limit = root.clientWidth;

    /** An element may overflow its own scroll container — only the page matters. */
    const insideScroller = (el: Element): boolean => {
      let node = el.parentElement;
      while (node && node !== document.body) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX !== "visible") return true;
        node = node.parentElement;
      }
      return false;
    };

    const describe = (el: Element): string => {
      const id = el.id ? `#${el.id}` : "";
      const cls = (el.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6)
        .join(".");
      return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ""}`;
    };

    const offenders: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (offenders.length >= 5) break;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      // 1px of slack: sub-pixel layout rounds, and a hairline is not a defect.
      if (rect.right <= limit + 1) continue;
      if (insideScroller(el)) continue;
      offenders.push(`${describe(el)} → right ${Math.round(rect.right)}px`);
    }

    return { scrollWidth: root.scrollWidth, clientWidth: limit, offenders };
  });
}

/** Open `route` at `width` and assert the document does not scroll sideways. */
async function expectNoHorizontalScroll(
  page: Page,
  route: string,
  width: number,
): Promise<void> {
  await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
  await page.goto(route);

  // Measure a rendered page, not a skeleton: the root layout's <main> is
  // present on every route.
  await expect(page.locator("#main-content")).toBeVisible();

  const { scrollWidth, clientWidth, offenders } = await measureOverflow(page);

  expect(
    scrollWidth,
    [
      `${route} @ ${width}px scrolls horizontally `,
      `(scrollWidth ${scrollWidth} > clientWidth ${clientWidth}).`,
      offenders.length
        ? ` Widest elements: ${offenders.join("; ")}`
        : " No single element overflows — suspect a container's min-width or a negative margin.",
    ].join(""),
  ).toBeLessThanOrEqual(clientWidth);
}

test.describe("narrow viewports have no horizontal scroll", () => {
  for (const width of WIDTHS) {
    for (const route of STATIC_ROUTES) {
      // `/cart` is empty here: every test gets a fresh context, so this asserts
      // the empty-cart layout. The filled one is covered by cart-flow.spec.ts.
      test(`${route} fits ${width}px`, async ({ page }) => {
        await expectNoHorizontalScroll(page, route, width);
      });
    }

    test(`a product page fits ${width}px`, async ({ page }) => {
      // Resolve the slug from the catalog instead of hardcoding a fixture: this
      // spec is about layout, so it should keep working against any seed.
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      await page.goto("/products");

      const hrefs = await page
        .locator('#main-content a[href^="/products/"]')
        .evaluateAll((links) =>
          links.map((link) => link.getAttribute("href") ?? ""),
        );
      // A bare `/products/<slug>` — never a filtered or paginated catalog URL.
      const productHref = hrefs.find((href) =>
        /^\/products\/[^/?#]+$/.test(href),
      );
      expect(productHref, "the catalog rendered no product links").toBeTruthy();

      await expectNoHorizontalScroll(page, productHref as string, width);
    });
  }
});
