import * as fs from "node:fs";
import * as path from "node:path";
import { test, expect, type Page } from "./fixtures/test";
import { addSeededProductToCart } from "./fixtures/cart";

/**
 * Wave F, storefront half (docs/reviews/2026-08-27-demo-run.md: D15, D07).
 * Each test asserts the FIXED behaviour, so it was red before the wave landed.
 *
 *   - TASK-1996: in a landscape phone viewport the search suggestions popup
 *     fits the viewport height and scrolls inside.
 *   - TASK-1997: with several pickup points none is preselected, and leaving it
 *     unchosen stops the step with «Оберіть пункт самовивозу».
 *   - TASK-1991 (D01): a client navigation to `/promo` opens it at the top, not
 *     scrolled down to the deals listing. The fix (`PromoScrollAnchor`) leans on
 *     Next's scroll-to-first-element of a new segment, so this is the guard that
 *     goes red if Next changes that.
 *
 * Both reads the storefront makes about them are mocked, as
 * checkout-delivery.spec.ts does: the seeded catalogue has one product and no
 * pickup points, and the delivery settings row is a singleton the admin suite
 * owns — flipping it here would race `admin-settings-delivery`. What is under
 * test is the storefront's rendering, not the API.
 *
 * `WAVE_F_SHOTS=before|after` writes the defect moment to
 * `docs/images/wave-f/<mode>/<task>-<name>.png`, BEFORE the assertion.
 */

const SHOTS = process.env.WAVE_F_SHOTS;
const SHOTS_DIR =
  SHOTS === "before" || SHOTS === "after"
    ? path.resolve(__dirname, "../docs/images/wave-f", SHOTS)
    : null;

async function shot(page: Page, task: number, name: string): Promise<void> {
  if (!SHOTS_DIR) return;
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SHOTS_DIR, `${task}-${name}.png`),
    animations: "disabled",
    caret: "hide",
  });
}

test.describe("TASK-1996: search suggestions in landscape", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("the popup fits the viewport height and scrolls inside", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.route("**/api/search/suggest**", (route) =>
      route.fulfill({
        json: {
          data: Array.from({ length: 10 }, (_, i) => ({
            slug: `chokhol-${i + 1}`,
            name: `Чохол MagSafe для iPhone ${i + 1}`,
          })),
        },
      }),
    );
    await page.route("**/api/blog/suggest**", (route) =>
      route.fulfill({
        json: {
          data: Array.from({ length: 5 }, (_, i) => ({
            slug: `post-${i + 1}`,
            title: `Як обрати чохол — частина ${i + 1}`,
            coverImageUrl: null,
          })),
        },
      }),
    );

    await page.goto("/");
    // 844px is md–lg: the header pill shows the compact magnifier, which
    // opens the shared autocomplete in a panel.
    const trigger = page.locator('button[aria-label="Відкрити пошук"]:visible');
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    await trigger.click();
    const panelId = await trigger.getAttribute("aria-controls");
    // The panel's field is focused on open; type into it.
    await expect(page.locator(`[id="${panelId}"] input`)).toBeFocused();
    await page.keyboard.type("чохол", { delay: 30 });

    const listbox = page
      .getByRole("listbox", { name: "Пошук товарів" })
      .locator("visible=true");
    await expect(listbox.getByRole("option")).toHaveCount(10, {
      timeout: 15_000,
    });
    await expect(page.getByRole("option").locator("visible=true")).toHaveCount(
      15,
    );

    const state = await listbox.evaluate((list, id) => {
      // The popup root is the listbox's parent; the compact panel around it
      // is what the shopper sees as «the dropdown».
      const popup = list.parentElement!;
      const panel = (id && document.getElementById(id)) || popup;
      const bottom = Math.max(
        popup.getBoundingClientRect().bottom,
        panel.getBoundingClientRect().bottom,
      );
      const scrollable = [popup, ...popup.querySelectorAll("*")].some((el) => {
        const { overflowY } = getComputedStyle(el);
        return (
          (overflowY === "auto" || overflowY === "scroll") &&
          el.scrollHeight > el.clientHeight + 1
        );
      });
      return {
        bottom: Math.round(bottom),
        viewportHeight: window.innerHeight,
        scrollable,
      };
    }, panelId);
    await shot(page, 1996, "search-landscape");

    expect.soft(state.scrollable, "the popup content scrolls").toBe(true);
    expect(state.bottom, "popup bottom vs viewport height").toBeLessThanOrEqual(
      state.viewportHeight,
    );
  });
});

const POINTS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Магазин на Хрещатику",
    city: "Київ",
    address: "вул. Хрещатик, 22",
    phone: "+380441234567",
    workingHours: "Пн–Сб 10:00–20:00",
    mapUrl: "https://maps.example/khreshchatyk",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Магазин на Подолі",
    city: "Київ",
    address: "вул. Сагайдачного, 5",
    phone: "+380447654321",
    workingHours: "Пн–Нд 10:00–21:00",
    mapUrl: "https://maps.example/podil",
  },
];

test.describe("TASK-1997: several pickup points", () => {
  test("none is preselected, and an unchosen point stops the step", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.route("**/api/delivery/methods", (route) =>
      route.fulfill({
        json: {
          data: {
            // The full offer shape of checkout-delivery.spec.ts — a `null`
            // courier crashes the page into its error boundary.
            methods: ["NOVA_POSHTA", "PICKUP", "COURIER", "OTHER"],
            courier: { price: "150.00", freeFrom: "2000.00", cityName: "Київ" },
            pickupPoints: POINTS,
            paymentMatrix: {
              NOVA_POSHTA: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
              PICKUP: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
              COURIER: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
              OTHER: ["ON_DELIVERY"],
            },
          },
        },
      }),
    );
    // Nothing may be ordered by this test, whatever the form does.
    await page.route("**/api/orders", (route) =>
      route.request().method() === "POST" ? route.abort() : route.fallback(),
    );

    await addSeededProductToCart(page);
    await page.goto("/checkout");

    const main = page.getByRole("main");
    await main
      .getByRole("radiogroup", { name: "Спосіб доставки" })
      .getByRole("radio", { name: /Самовивіз з магазину/ })
      .check();

    const points = main.getByRole("radiogroup", { name: "Пункт самовивозу" });
    await expect(points.getByRole("radio")).toHaveCount(2);
    const checked = await points
      .getByRole("radio")
      .evaluateAll((radios) =>
        radios
          .filter(
            (r) =>
              (r as HTMLInputElement).checked ||
              r.getAttribute("aria-checked") === "true",
          )
          .map((r) => r.closest("label")?.textContent?.trim() ?? r.id),
      );
    await shot(page, 1997, "pickup-preselected");
    expect.soft(checked, "checked pickup points").toEqual([]);

    await main.locator("#checkout-email").fill("olena@example.com");
    await main.getByLabel("Ім'я", { exact: true }).fill("Олена");
    await main.getByLabel("Прізвище", { exact: true }).fill("Шевченко");
    await main.locator("#checkout-phone").fill("+380501234567");
    await main.getByRole("button", { name: "Далі" }).click();

    await expect(
      main.getByText("Оберіть пункт самовивозу"),
      "the step names the missing pickup point",
    ).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("TASK-1991: /promo opens at the top", () => {
  test("a client navigation from the header lands on the hero, not the deals", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Акції", exact: true })
      .click();
    await page.waitForURL("**/promo");

    // The page segment (or its loading.tsx) streams into the deals slot after
    // the frame: wait for it, then give Next's post-navigation scroll its chance.
    await expect(page.getByTestId("promo-scroll-anchor")).toBeAttached({
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_000);

    expect(
      await page.evaluate(() => window.scrollY),
      "scrollY after navigating to /promo",
    ).toBe(0);
  });
});
