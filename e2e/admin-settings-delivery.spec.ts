import { test, expect, type Page } from "./fixtures/test";
import { loginAsAdmin } from "./fixtures/admin-session";
import { waitForHydration } from "./fixtures/hydration";

/**
 * TASK-644 — /settings/delivery round trip: switch the courier on, give it a
 * price, save, reload, and the saved value is what the page shows.
 *
 * What only a real browser and a real API prove here: the PUT body the form
 * builds is one `UpdateDeliverySettingDto` accepts (decimal comma read as a
 * point, the threshold as `null`), and the form re-seeded from the refetched
 * row — not from its own memory — shows the stored price after a hard reload.
 *
 * The settings row is a singleton shared by every spec that reaches checkout,
 * so the courier's previous state is put back afterwards: a courier left
 * switched on would add a method card to the storefront checkout specs.
 *
 * Labels are `dict.deliverySettingsForm.*` / `dict.nav.*` from the admin
 * dictionary, hardcoded because the app is not importable from this suite.
 * The admin apostrophe is `ʼ` (U+02BC).
 */

const COURIER = "Курʼєр по місту";
const CITY = "Місто";
const PRICE = "Вартість";
const FREE_FROM = "Безкоштовно від";
const SAVE = "Зберегти";

interface CourierState {
  enabled: boolean;
  city: string;
  price: string;
  freeFrom: string;
}

async function openDeliverySettings(page: Page) {
  await page.goto("/settings/delivery");
  const form = page.locator("form").filter({
    has: page.getByRole("switch", { name: COURIER }),
  });
  await expect(form).toBeVisible();
  // A click before hydration is a native submit, not the RHF handler.
  await waitForHydration(form);
}

const courierSwitch = (page: Page) =>
  page.getByRole("switch", { name: COURIER });

async function readCourier(page: Page): Promise<CourierState> {
  const enabled =
    (await courierSwitch(page).getAttribute("aria-checked")) === "true";
  if (!enabled) return { enabled, city: "", price: "", freeFrom: "" };
  return {
    enabled,
    city: await page.getByRole("textbox", { name: CITY }).inputValue(),
    price: await page.getByRole("textbox", { name: PRICE }).inputValue(),
    freeFrom: await page.getByRole("textbox", { name: FREE_FROM }).inputValue(),
  };
}

async function save(page: Page) {
  const response = page.waitForResponse(
    (res) =>
      res.url().includes("/api/admin/delivery-settings") &&
      res.request().method() === "PUT",
  );
  await page.getByRole("button", { name: SAVE }).click();
  expect((await response).ok()).toBe(true);
  // The baseline moved to what was saved: nothing is left unsaved.
  await expect(page.getByText(/^Незбережені зміни/)).toHaveCount(0);
}

test.describe("admin delivery settings (TASK-644)", () => {
  let original: CourierState | null = null;

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test.afterEach(async ({ page }) => {
    if (!original) return;
    await openDeliverySettings(page);
    const now = await readCourier(page);
    if (now.enabled !== original.enabled) await courierSwitch(page).click();
    if (original.enabled) {
      await page.getByRole("textbox", { name: CITY }).fill(original.city);
      await page.getByRole("textbox", { name: PRICE }).fill(original.price);
      await page
        .getByRole("textbox", { name: FREE_FROM })
        .fill(original.freeFrom);
    }
    // A switched-off courier's fields are not validated, so this always saves.
    await save(page);
    original = null;
  });

  test("a courier price survives a save and a reload", async ({ page }) => {
    await openDeliverySettings(page);
    original = await readCourier(page);

    if (!original.enabled) await courierSwitch(page).click();
    await expect(courierSwitch(page)).toBeChecked();

    // Distinct per run, typed with a decimal comma as a Ukrainian keyboard does.
    const price = 100 + (Date.now() % 800);
    await page.getByRole("textbox", { name: CITY }).fill("Київ");
    await page.getByRole("textbox", { name: PRICE }).fill(`${price},5`);
    await page.getByRole("textbox", { name: FREE_FROM }).fill("");

    // The preview follows the unsaved form.
    const preview = page.getByTestId("delivery-preview");
    await expect(preview.getByText("Курʼєр · Київ")).toBeVisible();

    await save(page);

    await page.reload();
    await openDeliverySettings(page);
    await expect(courierSwitch(page)).toBeChecked();
    await expect(page.getByRole("textbox", { name: PRICE })).toHaveValue(
      `${price}.5`,
    );
    await expect(page.getByRole("textbox", { name: FREE_FROM })).toHaveValue(
      "",
    );
    await expect(page.getByRole("textbox", { name: CITY })).toHaveValue("Київ");
  });
});

/**
 * TASK-645 — a pickup point through its whole life on the real API: added in
 * the dialog, deactivated from its «⋯» menu, deleted behind the confirmation
 * (which, for an inactive point, no longer offers «Деактивувати замість цього»).
 *
 * The point list shows only while the pickup card is switched on. The switch
 * is flipped in the FORM and never saved, so the storefront's checkout is not
 * touched; the point itself is the only write, and it is removed again — by
 * the test, or by afterEach when a step failed half-way (a stray ACTIVE point
 * would add «Самовивіз» to every checkout spec).
 */
const PICKUP = "Самовивіз з магазину";
const pointMenu = (page: Page, name: string) =>
  page.getByRole("button", { name: `Дії з точкою «${name}»` });

async function showPickupPoints(page: Page) {
  await openDeliverySettings(page);
  const pickup = page.getByRole("switch", { name: PICKUP });
  if ((await pickup.getAttribute("aria-checked")) !== "true") {
    await pickup.click();
  }
  await expect(
    page.getByRole("button", { name: "Додати точку" }),
  ).toBeVisible();
}

async function deletePoint(page: Page, name: string) {
  await pointMenu(page, name).click();
  await page.getByRole("menuitem", { name: "Видалити…" }).click();
  const confirm = page.getByRole("alertdialog", {
    name: `Видалити точку «${name}»?`,
  });
  await expect(confirm).toBeVisible();
  const deleted = page.waitForResponse(
    (res) =>
      res.url().includes("/api/admin/pickup-points/") &&
      res.request().method() === "DELETE",
  );
  await confirm.getByRole("button", { name: "Видалити", exact: true }).click();
  expect((await deleted).ok()).toBe(true);
  return confirm;
}

test.describe("admin pickup points (TASK-645)", () => {
  let leftover: string | null = null;

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test.afterEach(async ({ page }) => {
    if (!leftover) return;
    await showPickupPoints(page);
    if ((await pointMenu(page, leftover).count()) > 0) {
      await deletePoint(page, leftover);
    }
    leftover = null;
  });

  test("a point is added, deactivated and deleted", async ({ page }) => {
    await showPickupPoints(page);
    const name = `E2E точка ${Date.now()}`;

    // ── add ──────────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Додати точку" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Додати точку самовивозу",
    });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("textbox", { name: "Назва", exact: true })
      .fill(name);
    await dialog
      .getByRole("textbox", { name: "Місто", exact: true })
      .fill("Київ");
    await dialog
      .getByRole("textbox", { name: "Адреса", exact: true })
      .fill("вул. Тестова, 1");
    await dialog
      .getByRole("textbox", { name: "Посилання на карту" })
      .fill("https://maps.app.goo.gl/e2e");
    const created = page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/admin/pickup-points") &&
        res.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Зберегти" }).click();
    expect((await created).ok()).toBe(true);
    leftover = name;
    await expect(dialog).toBeHidden();

    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("Показується");
    // Saving a point is not saving the settings: the switch flip is still
    // the only unsaved change, and no settings PUT went out.
    await expect(page.getByText(/^Незбережені зміни/)).toBeVisible();

    // ── deactivate ───────────────────────────────────────────────────────
    const updated = page.waitForResponse(
      (res) =>
        res.url().includes("/api/admin/pickup-points/") &&
        res.request().method() === "PUT",
    );
    await pointMenu(page, name).click();
    await page.getByRole("menuitem", { name: "Деактивувати" }).click();
    expect((await updated).ok()).toBe(true);
    await expect(row).toContainText("Неактивна");

    // ── delete ───────────────────────────────────────────────────────────
    await pointMenu(page, name).click();
    await page.getByRole("menuitem", { name: "Видалити…" }).click();
    const confirm = page.getByRole("alertdialog", {
      name: `Видалити точку «${name}»?`,
    });
    await expect(confirm).toContainText("Замовлень на неї немає.");
    // Already inactive: nothing to deactivate instead.
    await expect(
      confirm.getByRole("button", { name: "Деактивувати замість цього" }),
    ).toHaveCount(0);
    await confirm.getByRole("button", { name: "Скасувати" }).click();
    await expect(confirm).toBeHidden();

    await deletePoint(page, name);
    leftover = null;
    await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(
      0,
    );
  });
});
