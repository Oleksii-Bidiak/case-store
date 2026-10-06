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
