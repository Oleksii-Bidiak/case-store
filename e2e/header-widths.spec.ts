import { test, expect, type Page } from "./fixtures/test";
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from "./fixtures/seed-e2e";
import { waitForHydration } from "./fixtures/hydration";

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

  test("signed in: the account menu trigger is a 44×44 target at every band", async ({
    page,
  }) => {
    // Every check above runs as a guest. Signed in, «Кабінет» is a different
    // control — AccountDropdown's menu button — and it stayed a 36px h-9 w-9
    // box after the guest button became 44×44. It now shares the guest box,
    // so it also gets the «Кабінет» caption from `xl`.
    await page.goto("/login");
    // A `has` locator resolves INSIDE the outer element, so it must not carry
    // its own `main` root — scope the form to `main`, then find the button in it.
    const submitName = { name: /^увійти$/i };
    const form = page
      .getByRole("main")
      .locator("form")
      .filter({ has: page.getByRole("button", submitName) });
    const submit = form.getByRole("button", submitName);
    await waitForHydration(form);
    await page.getByLabel(/(пошта|email)/i).fill(E2E_USER_EMAIL);
    await page.getByLabel(/(пароль|password)/i).fill(E2E_USER_PASSWORD);
    await submit.click();
    await expect(page).not.toHaveURL(/\/login/);

    for (const width of [390, 768, 1024, 1280]) {
      await openAt(page, width);
      const trigger = header(page).getByRole("button", {
        name: "Кабінет — меню акаунту",
      });
      await expect(trigger).toBeVisible();
      const box = await trigger.boundingBox();
      expect(
        box?.width ?? 0,
        `trigger width at ${width}`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        box?.height ?? 0,
        `trigger height at ${width}`,
      ).toBeGreaterThanOrEqual(44);
      expect((await trigger.innerText()).trim()).toBe(
        width >= 1280 ? "Кабінет" : "",
      );
    }

    // The taller trigger leaves the 1024 input above the floor too.
    await openAt(page, 1024);
    const input = await searchInput(page).boundingBox();
    expect(input?.width ?? 0).toBeGreaterThanOrEqual(MIN_INPUT_WIDTH);
  });
});

/**
 * The header across the whole width range (TASK-504, TASK-505 — plan 197,
 * «Приймання»).
 *
 * TASK-504 began as a measurement: the header cluster outgrew the 768px row,
 * the wordmark was crushed (26px of its own 36), and the theme switch was
 * hidden until `min-[1100px]` while the slide-out menu already vanished at
 * `md` — so 768–1099 had no way to change the theme at all. The slide-out menu
 * and the row switch now hand over at the same breakpoint (`xl` since
 * TASK-511/512), and the search pill, not the brand, yields. This block pins
 * the outcome at the eight widths the plan names, so a new item in the action
 * cluster cannot quietly bring any of it back:
 *
 *   1. the document never scrolls sideways;
 *   2. the header row fits itself and the wordmark is shown whole — not cut by
 *      its own `truncate`, not past the edge;
 *   3. exactly one of the two theme entry points is on screen: the row switch
 *      from `xl`, the menu trigger (whose drawer carries the switch) below it.
 *      Never neither — that was the 768–1099 hole.
 *
 * Widths: 320/360/390 are the phone band (390 is where Обране and Кабінет come
 * back — the widest phone cluster); 768 is the row TASK-504 measured; 1024 is
 * the full search pill; 1280 is `xl`, where the section links, the theme switch
 * and the captions all arrive at once — the tightest desktop row; 1366 and 1440
 * are past the `max-w-page` cap.
 *
 * Measured on `/`, the landing page — the same header component as on
 * `/products` above, but the first row a visitor ever sees.
 */

const WIDTHS = [320, 360, 390, 768, 1024, 1280, 1366, 1440] as const;

/** Tailwind v4 `xl` — where the row switch replaces the menu trigger. */
const XL = 1280;

interface HeaderReport {
  scrollWidth: number;
  innerWidth: number;
  rowScrollWidth: number;
  rowClientWidth: number;
  /** null when an uploaded logo image replaces the typographic wordmark. */
  wordmark: {
    text: string;
    scrollWidth: number;
    clientWidth: number;
    right: number;
  } | null;
  brand: { left: number; right: number; width: number };
}

async function openHome(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
  await page.goto("/");
  await expect(header(page).locator('a[href="/"]')).toBeVisible();
  // The wordmark's width depends on the display font; measuring before it
  // swaps in would test the fallback face.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function measureHeader(page: Page): Promise<HeaderReport> {
  return page.evaluate<HeaderReport>(() => {
    const el = document.querySelector("header");
    if (!el) throw new Error("no <header> on the page");
    // The header's one child is the PAGE_CONTAINER row holding every cluster.
    const row = el.firstElementChild as HTMLElement;
    const brandLink = el.querySelector<HTMLAnchorElement>('a[href="/"]');
    if (!brandLink) throw new Error('no home link (a[href="/"]) in the header');
    const wordmarkEl = brandLink.querySelector<HTMLElement>("span.truncate");
    const brandRect = brandLink.getBoundingClientRect();
    const wordRect = wordmarkEl?.getBoundingClientRect();

    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      rowScrollWidth: row.scrollWidth,
      rowClientWidth: row.clientWidth,
      wordmark:
        wordmarkEl && wordRect
          ? {
              text: (wordmarkEl.textContent ?? "").trim(),
              scrollWidth: wordmarkEl.scrollWidth,
              clientWidth: wordmarkEl.clientWidth,
              right: wordRect.right,
            }
          : null,
      brand: {
        left: brandRect.left,
        right: brandRect.right,
        width: brandRect.width,
      },
    };
  });
}

test.describe("the header fits every width from 320 to 1440 (TASK-504, TASK-505)", () => {
  for (const width of WIDTHS) {
    test(`/ at ${width}px — no sideways scroll, the wordmark is whole`, async ({
      page,
    }) => {
      await openHome(page, width);
      const r = await measureHeader(page);

      expect(
        r.scrollWidth,
        `/ @ ${width}px scrolls horizontally (scrollWidth ${r.scrollWidth} > innerWidth ${r.innerWidth})`,
      ).toBeLessThanOrEqual(r.innerWidth);

      expect(
        r.rowScrollWidth,
        `the header row overflows itself at ${width}px (${r.rowScrollWidth} > ${r.rowClientWidth}) — some cluster no longer shrinks`,
      ).toBeLessThanOrEqual(r.rowClientWidth);

      expect(r.brand.left).toBeGreaterThanOrEqual(0);
      expect(r.brand.right).toBeLessThanOrEqual(r.innerWidth);

      if (r.wordmark) {
        // `truncate` turns overflow into an ellipsis, so a clipped wordmark
        // shows up as scrollWidth > clientWidth on the text box itself.
        expect(
          r.wordmark.scrollWidth,
          `the wordmark «${r.wordmark.text}» is cut at ${width}px (${r.wordmark.scrollWidth} of ${r.wordmark.clientWidth})`,
        ).toBeLessThanOrEqual(r.wordmark.clientWidth);
        expect(r.wordmark.clientWidth).toBeGreaterThan(0);
        expect(r.wordmark.right).toBeLessThanOrEqual(r.innerWidth);
      } else {
        // An uploaded logo replaced the wordmark: it still needs a real width
        // beyond the 36px monogram box.
        expect(r.brand.width).toBeGreaterThan(36);
      }

      // Exactly one theme entry point per width — never neither. `exact`:
      // «Темна» is a substring of «Системна».
      const rowSwitch = header(page).getByRole("radio", {
        name: "Темна",
        exact: true,
      });
      const menuTrigger = header(page).getByRole("button", {
        name: "Відкрити меню",
        exact: true,
      });
      if (width >= XL) {
        await expect(rowSwitch).toBeVisible();
        await expect(menuTrigger).toBeHidden();
      } else {
        await expect(menuTrigger).toBeVisible();
        await expect(rowSwitch).toBeHidden();
      }
    });
  }

  // 768 is the band TASK-504 found with no theme control at all; prove the
  // drawer that serves it really carries the switch, and that it works.
  test("at 768px the slide-out menu carries a working theme switch", async ({
    page,
  }) => {
    await openHome(page, 768);
    await header(page)
      .getByRole("button", { name: "Відкрити меню", exact: true })
      .click();

    const drawer = page.getByRole("dialog");
    const dark = drawer.getByRole("radio", { name: "Темна", exact: true });
    await expect(dark).toBeVisible();
    await dark.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("the account settings carry the theme switch, not a note about it", async ({
    page,
  }) => {
    // TASK-505: «Налаштування» used to say the theme «автоматично
    // підлаштовується» under the system — untrue since TASK-412 added a manual
    // switch. The card now holds the same control the header does.
    await page.goto("/login");
    const submitName = { name: /^увійти$/i };
    const form = page
      .getByRole("main")
      .locator("form")
      .filter({ has: page.getByRole("button", submitName) });
    await waitForHydration(form);
    await page.getByLabel(/(пошта|email)/i).fill(E2E_USER_EMAIL);
    await page.getByLabel(/(пароль|password)/i).fill(E2E_USER_PASSWORD);
    await form.getByRole("button", submitName).click();
    await expect(page).not.toHaveURL(/\/login/);

    for (const [width, choice, theme] of [
      [390, "Темна", "dark"],
      [1440, "Світла", "light"],
    ] as const) {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      await page.goto("/account");
      const main = page.getByRole("main");
      await main
        .getByRole("button", { name: "Налаштування", exact: true })
        .click();
      await expect(
        main.getByRole("heading", { name: "Оформлення" }),
      ).toBeVisible();
      await expect(main.getByText(/автоматично/i)).toHaveCount(0);

      const group = main.getByRole("radiogroup");
      await expect(group).toBeVisible();
      await expect(group.getByRole("radio")).toHaveCount(3);

      await group.getByRole("radio", { name: choice, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(width);
    }
  });
});
