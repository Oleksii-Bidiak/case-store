import { test, expect, type Page } from "./fixtures/test";
import { E2E_PRODUCT_SLUG } from "./fixtures/seed-e2e";
import { addSeededProductToCart } from "./fixtures/cart";

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

// The catalog list is fetched on the client, so give it room to paint before
// reading a slug out of it. Generous on purpose — a cold dev-mode compile
// dominates this wait, and the fixture fallback below means a timeout still
// does not cost us the width assertion.
const CATALOG_RENDER_TIMEOUT_MS = 15_000;

/** Same budget for the per-route content gate below — same cold-compile cause. */
const CONTENT_RENDER_TIMEOUT_MS = 15_000;

/**
 * Routes with a stable URL and nothing to set up. The PDP is resolved from the
 * catalog at runtime; `/checkout` needs a cart and gets its own test — an empty
 * cart redirects it straight back to `/cart`, so listing it here would have
 * measured `/cart` twice under a name that promised checkout.
 */
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

/**
 * What has to be on screen before a route may be measured.
 *
 * `#main-content` is NOT a usable gate: it is the root layout's `<main>`, server
 * -rendered on every route, so waiting for it proves only that Next answered.
 * `/products` and the PDP are client-fetched widgets behind `Suspense`, so the
 * measurement then ran against a skeleton — a placeholder grid of fixed-width
 * boxes that cannot overflow by construction. The spec was green for the two
 * routes carrying the real risk.
 *
 * Each entry is therefore a marker of the route's OWN content. `/products`
 * cannot use the heading, which the server renders above the grid; it waits for
 * a card.
 */
const READY_SELECTOR: Record<string, string> = {
  "/products": '#main-content a[href^="/products/"]',
};

/** Default marker: the route's own H1, which every storefront page renders. */
const DEFAULT_READY_SELECTOR = "#main-content h1";

function readySelector(route: string): string {
  return READY_SELECTOR[route] ?? DEFAULT_READY_SELECTOR;
}

/** Open `route` at `width` and assert the document does not scroll sideways. */
async function expectNoHorizontalScroll(
  page: Page,
  route: string,
  width: number,
): Promise<void> {
  await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
  await page.goto(route);

  await expect(page.locator(readySelector(route)).first()).toBeVisible({
    timeout: CONTENT_RENDER_TIMEOUT_MS,
  });

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
      // Prefer a slug read from the catalog so the spec keeps working against a
      // richer seed, but WAIT for the cards first: the list is fetched on the
      // client, so reading the DOM straight after `goto` finds an empty grid and
      // the test fails for a reason that has nothing to do with layout.
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      await page.goto("/products");

      // A bare `/products/<slug>` — never a filtered or paginated catalog URL.
      const productHref = await page
        .locator('#main-content a[href^="/products/"]')
        .first()
        .getAttribute("href", { timeout: CATALOG_RENDER_TIMEOUT_MS })
        .catch(() => null);

      // Fall back to the fixture the global setup guarantees. The minimal e2e
      // seed holds a single product, and a catalog that renders none of it is a
      // data problem — it must not silently cost us the PDP width check, which
      // is the one route here with a three-column desktop layout to collapse.
      const target =
        productHref && /^\/products\/[^/?#]+$/.test(productHref)
          ? productHref
          : `/products/${E2E_PRODUCT_SLUG}`;

      await expectNoHorizontalScroll(page, target, width);
    });

    // The densest narrow layout in the storefront — address form, delivery
    // picker and order summary on one screen — and the one plan 174 named that
    // the first version of this spec quietly dropped. It needs a cart: an empty
    // one redirects to `/cart` (checkout-view.tsx), so a bare `goto` would have
    // measured the wrong page and passed.
    test(`the checkout fits ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      await addSeededProductToCart(page);

      await expectNoHorizontalScroll(page, "/checkout", width);
    });
  }
});
