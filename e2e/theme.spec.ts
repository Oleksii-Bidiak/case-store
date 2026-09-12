import { test, expect, type Page } from "./fixtures/test";

/**
 * Manual theme switch (TASK-412).
 *
 * The one thing unit tests cannot see is WHEN the theme is applied. next-themes
 * writes `data-theme` from a blocking inline script it renders at the top of
 * the provider tree; if that ever regresses to an effect, every page load of a
 * dark-theme visitor starts with a white flash and nothing in Jest notices. So
 * the assertion here is not just "the attribute is dark after the reload" but
 * "the attribute was ALREADY dark by the time the page's own content existed".
 *
 * The second case is the CSS rule the two blocks in `globals.css` exist for: a
 * visitor on a dark OS who explicitly picks light must get light. That is the
 * `:root:not([data-theme='light'])` half, and a plain `prefers-color-scheme`
 * media query alone would fail it.
 */

declare global {
  interface Window {
    /** `data-theme` sampled the instant the page's `<main>` entered the DOM. */
    __themeAtContent?: string | null;
  }
}

/**
 * Sample `data-theme` at the moment `#main-content` (the root layout's `<main>`)
 * is first attached.
 *
 * Deliberately not "when `<body>` appears": the provider — and therefore the
 * inline theme script — lives INSIDE `<body>`, so at that instant the attribute
 * is legitimately still missing. The parser runs the script synchronously while
 * it is still building the body, so sampling at the first piece of page content
 * is both fair and strict: a MutationObserver callback lands in the parser's own
 * task, before any paint. If the attribute were applied from an effect instead,
 * the content would exist first and this reads `null`.
 */
async function recordThemeAtFirstContent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (
        window.__themeAtContent === undefined &&
        document.querySelector("#main-content")
      ) {
        window.__themeAtContent =
          document.documentElement.getAttribute("data-theme");
        observer.disconnect();
      }
    });
    // `document`, not `document.documentElement`: an init script runs before
    // the parser has created <html>, so the element is still null here and
    // `observe(null)` throws — silently, taking the whole recorder with it.
    observer.observe(document, { childList: true, subtree: true });
  });
}

/**
 * One option of the header switch. `exact` is not optional here: Playwright
 * matches accessible names as substrings, and "Темна" is a substring of
 * "Системна" — without it the locator resolves to two elements and fails.
 */
function themeOption(page: Page, name: string) {
  return page.locator("header").getByRole("radio", { name, exact: true });
}

test.describe("manual theme switch", () => {
  test("a chosen dark theme is on <html> before the page renders", async ({
    page,
  }) => {
    await recordThemeAtFirstContent(page);
    await page.goto("/");

    // The header switch lives at >=1100px; the default project viewport is
    // 1280 wide, so it is on screen here.
    const dark = themeOption(page, "Темна");
    await expect(dark).toBeVisible();
    await dark.click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(dark).toHaveAttribute("aria-checked", "true");

    await page.reload();

    // The choice survived the reload…
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    // …and, the point of this spec, it was applied before the page's content.
    const themeAtContent = await page.evaluate(() => window.__themeAtContent);
    expect(
      themeAtContent,
      "data-theme was missing when <main> appeared — the theme is applied after " +
        "first paint, which is a flash of the wrong theme on every load",
    ).toBe("dark");
  });

  test("an explicit light choice beats a dark OS preference", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    // Untouched, the storefront follows the OS.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await themeOption(page, "Світла").click();
    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    // The attribute alone could be cosmetic — check the tokens actually flipped.
    const background = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(
      background,
      "the light tokens did not win over the dark media query",
    ).toBe("rgb(255, 255, 255)");
  });
});
