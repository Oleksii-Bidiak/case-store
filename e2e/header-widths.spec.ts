import { test, expect, type Page } from "./fixtures/test";

/**
 * The storefront header at the three tablet/desktop bands (TASK-511, TASK-512).
 *
 * jsdom has no layout, so `header.test.tsx` can only pin the classes that
 * decide who yields. What it cannot see is the RESULT — whether the search
 * input actually has room at 1024. Before TASK-512 it measured ~79px there (the
 * placeholder cut to «Пошук»), because the section links, the theme switch and
 * the captioned actions all shared the row with it. This spec measures it.
 *
 *   768–1023  burger · logo · «Каталог | 🔍» · icon-only actions · cart
 *   1024–1279 burger · logo · full pill (input ≥ 240px) · icon-only actions · cart
 *   ≥ 1280    logo · full pill · Товари/Блог · theme switch · captioned actions · cart
 *
 * Dimensions read through the header's own landmark, so the catalogue's filter
 * field (also «Пошук товарів») never matches.
 */

const VIEWPORT_HEIGHT = 900;
/** The floor the owner-approved SiteHeader target sets for the input. */
const MIN_INPUT_WIDTH = 240;

async function openAt(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
  await page.goto("/products");
}

function header(page: Page) {
  return page.locator("header");
}

function searchInput(page: Page) {
  return header(page).locator('form[role="search"] input');
}

test.describe("header row by width (TASK-511, TASK-512)", () => {
  test("390: the 44×44 Обране / Кабінет icons leave the wordmark whole", async ({
    page,
  }) => {
    await openAt(page, 390);
    const row = header(page);

    // 390 is the first width that shows Обране and Кабінет next to the cart.
    // Making them full 44×44 targets once cost the brand 6px here and cut the
    // wordmark to «CaseSt…» — the phone spacing now pays for them instead.
    for (const action of [
      row.locator('a[href="/wishlist"]'),
      row.getByRole("button", { name: "Відкрити особистий кабінет" }),
    ]) {
      await expect(action).toBeVisible();
      const box = await action.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }

    const wordmark = row.locator('a[href="/"] span.truncate');
    await expect(wordmark).toHaveText("CaseStore");
    const truncated = await wordmark.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    expect(truncated, "the wordmark is cut at 390").toBe(false);
  });

  test("768: compact pill, icon-only 44×44 actions, the rest in the menu", async ({
    page,
  }) => {
    await openAt(page, 768);
    const row = header(page);

    await expect(
      row.getByRole("button", { name: "Відкрити меню" }),
    ).toBeVisible();
    // The pill collapses to «Каталог» + magnifier; the input is not on screen.
    await expect(searchInput(page)).toBeHidden();
    await expect(
      row.getByRole("navigation", { name: "Головне меню" }),
    ).toBeHidden();
    await expect(row.getByRole("radiogroup")).toBeHidden();

    for (const action of [
      row.getByRole("link", { name: "Акції" }),
      row.locator('a[href="/wishlist"]'),
    ]) {
      await expect(action).toBeVisible();
      const box = await action.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      // Icon only: no visible caption. `innerText`, not `toHaveText` — the
      // latter reads textContent, which still includes the display:none span.
      expect((await action.innerText()).trim()).toBe("");
    }

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(768);
  });

  test("1024: the search input is at least 240px wide", async ({ page }) => {
    await openAt(page, 1024);
    const row = header(page);

    // Burger stays to `xl`; the links and the theme switch live in it.
    await expect(
      row.getByRole("button", { name: "Відкрити меню" }),
    ).toBeVisible();
    await expect(
      row.getByRole("navigation", { name: "Головне меню" }),
    ).toBeHidden();
    await expect(row.getByRole("radiogroup")).toBeHidden();

    const input = searchInput(page);
    await expect(input).toBeVisible();
    const box = await input.boundingBox();
    expect(
      box?.width ?? 0,
      "the header search input is too narrow at 1024 — the placeholder is cut",
    ).toBeGreaterThanOrEqual(MIN_INPUT_WIDTH);
    // The whole placeholder fits — the visitor sees «Пошук товарів…», not «Пош».
    const clipped = await input.evaluate(
      (el) =>
        (el as HTMLInputElement).scrollWidth >
        (el as HTMLInputElement).clientWidth,
    );
    expect(clipped).toBe(false);

    // The menu carries what the row hides at this width.
    await row.getByRole("button", { name: "Відкрити меню" }).click();
    const menu = page.getByRole("dialog");
    await expect(menu.getByRole("link", { name: "Товари" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Блог" })).toBeVisible();
    await expect(menu.getByRole("radiogroup")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("1280: the full row, no menu trigger", async ({ page }) => {
    await openAt(page, 1280);
    const row = header(page);

    await expect(
      row.getByRole("button", { name: "Відкрити меню" }),
    ).toBeHidden();
    await expect(
      row.getByRole("navigation", { name: "Головне меню" }),
    ).toBeVisible();
    await expect(row.getByRole("radiogroup")).toBeVisible();
    await expect(row.getByRole("link", { name: "Акції" })).toHaveText("Акції");

    const box = await searchInput(page).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(MIN_INPUT_WIDTH);
  });
});
