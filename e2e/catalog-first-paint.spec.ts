import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect, type Page } from "./fixtures/test";
// Importing the seed module also loads the API's env file, so DATABASE_URL is
// the same database the webServer-booted API reads.
import {
  E2E_CATEGORY_SLUG,
  E2E_PRODUCT_SLUG,
  E2E_SOLD_OUT_PRODUCT_SLUG,
} from "./fixtures/seed-e2e";

/**
 * The catalogue's first paint with «Мої пристрої» (TASK-2421, TASK-2410).
 *
 * The saved devices are localStorage-only, so the server HTML is the
 * UNFILTERED listing. Before TASK-2421 a shopper whose default filter applies
 * saw that grid for a moment, then the filtered one. Now the root layout's
 * pre-paint script sets `html[data-device-filter]` and CSS keeps the server
 * grid hidden behind a skeleton until the filtered query lands.
 *
 * Fixture: `test-product` fits the device `e2e-phone-15` (the same pair
 * `compat-robots.spec.ts` creates), `test-product-sold-out` fits nothing — so
 * the sold-out card on screen means "the unfiltered grid was painted".
 */
const DEVICE_BRAND_SLUG = "e2e-device-brand";
const DEVICE_MODEL_SLUG = "e2e-phone-15";
const CATEGORY_PATH = `/categories/${E2E_CATEGORY_SLUG}`;
const UNFILTERED_ONLY = `a[href="/products/${E2E_SOLD_OUT_PRODUCT_SLUG}"]`;
const FITTING = `a[href="/products/${E2E_PRODUCT_SLUG}"]`;

let deviceModelId = "";

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const brand = await prisma.deviceBrand.upsert({
      where: { slug: DEVICE_BRAND_SLUG },
      update: { isActive: true },
      create: { name: "E2E Devices", slug: DEVICE_BRAND_SLUG },
    });
    const model = await prisma.deviceModel.upsert({
      where: { slug: DEVICE_MODEL_SLUG },
      update: { isActive: true, deviceBrandId: brand.id },
      create: {
        name: "E2E Phone 15",
        slug: DEVICE_MODEL_SLUG,
        deviceBrandId: brand.id,
      },
    });
    deviceModelId = model.id;
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: E2E_PRODUCT_SLUG },
    });
    await prisma.productDeviceCompat.upsert({
      where: {
        productId_deviceModelId: {
          productId: product.id,
          deviceModelId: model.id,
        },
      },
      update: {},
      create: { productId: product.id, deviceModelId: model.id },
    });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
});

/** Save the device in localStorage before any page script runs. */
async function saveDevice(page: Page, name = "E2E Phone 15"): Promise<void> {
  await page.addInitScript(
    ({ modelId, slug, name }) => {
      window.localStorage.setItem(
        "my-devices:v1",
        JSON.stringify([
          {
            modelId,
            slug,
            name,
            brandName: "E2E Devices",
            family: "iphone",
            lastUsedAt: 1,
          },
        ]),
      );
    },
    { modelId: deviceModelId, slug: DEVICE_MODEL_SLUG, name },
  );
}

/**
 * Sample every frame from the very first one: did a card that only the
 * unfiltered listing has ever become visible? rAF callbacks run before each
 * paint, so this sees what each painted frame holds.
 */
async function watchUnfilteredPaint(page: Page): Promise<void> {
  await page.addInitScript((selector) => {
    const w = window as unknown as { __unfilteredPainted?: boolean };
    w.__unfilteredPainted = false;
    const sample = () => {
      for (const el of document.querySelectorAll(selector)) {
        if ((el as HTMLElement).checkVisibility()) w.__unfilteredPainted = true;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, UNFILTERED_ONLY);
}

/** Keep React from ever hydrating: the server HTML + CSS + inline scripts only. */
async function blockHydration(page: Page): Promise<void> {
  // Scripts only: the stylesheet is served from the same chunks directory.
  await page.route("**/_next/static/chunks/**", (route) =>
    route.request().resourceType() === "script"
      ? route.abort()
      : route.continue(),
  );
}

for (const [label, viewport] of [
  ["390", { width: 390, height: 844 }],
  ["1440", { width: 1440, height: 900 }],
] as const) {
  test.describe(`catalogue first paint at ${label} (TASK-2421)`, () => {
    test.use({ viewport });

    test("with a saved device the unfiltered grid is never painted", async ({
      page,
    }) => {
      await saveDevice(page);
      await watchUnfilteredPaint(page);
      await page.goto(CATEGORY_PATH);

      // The default-filtered grid lands: the fitting card, not the other one.
      await expect(page.locator(FITTING).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator(UNFILTERED_ONLY)).toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { __unfilteredPainted?: boolean })
              .__unfilteredPainted,
        ),
      ).toBe(false);
    });

    test("control: with compat=off the probe does see the unfiltered grid", async ({
      page,
    }) => {
      await saveDevice(page);
      await watchUnfilteredPaint(page);
      await page.goto(`${CATEGORY_PATH}?compat=off`);
      await expect(page.locator(UNFILTERED_ONLY).first()).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { __unfilteredPainted?: boolean })
              .__unfilteredPainted,
        ),
      ).toBe(true);
    });

    test("before hydration: skeleton for a saved device, the server grid without one", async ({
      browser,
    }) => {
      // With a device: the flag is set in <head>, the grid and counts hidden.
      const withDevice = await browser.newPage({ viewport });
      await saveDevice(withDevice);
      await blockHydration(withDevice);
      await withDevice.goto(CATEGORY_PATH, { waitUntil: "domcontentloaded" });
      const html = withDevice.locator("html");
      await expect(html).toHaveAttribute("data-has-device", "");
      await expect(html).toHaveAttribute("data-device-filter", "");
      await expect(withDevice.locator(UNFILTERED_ONLY).first()).toBeHidden();
      await expect(
        withDevice.getByTestId("default-filter-skeleton"),
      ).toBeVisible();
      // The skeleton cards hold the fit slot the filtered cards will carry.
      const slotSkeleton = withDevice
        .getByTestId("device-fit-slot-skeleton")
        .first();
      await expect(slotSkeleton).toBeVisible();
      expect((await slotSkeleton.boundingBox())?.height).toBe(38);
      await withDevice.close();

      // Without one: the server grid paints at once, no device-fit slot.
      const without = await browser.newPage({ viewport });
      await blockHydration(without);
      await without.goto(CATEGORY_PATH, { waitUntil: "domcontentloaded" });
      await expect(without.locator(UNFILTERED_ONLY).first()).toBeVisible();
      await expect(without.getByTestId("default-filter-skeleton")).toBeHidden();
      for (const slot of await without
        .locator('[data-slot="device-fit-slot"]')
        .all()) {
        await expect(slot).toBeHidden();
      }
      await without.close();
    });

    // A long name wraps the mark to the slot's two lines; a short one leaves
    // a one-line mark — the case TASK-2410 measures the spare space for.
    for (const deviceName of ["E2E Phone 15", "iPhone 13"]) {
      test(`SF-CAT-80: the «${deviceName}» mark lands without moving price or buttons`, async ({
        browser,
      }) => {
        // compat=off: the unfiltered grid stays on screen with a saved device,
        // which is where the server render and the hydrated card can be compared.
        const url = `${CATEGORY_PATH}?compat=off`;
        const boxes = async (page: Page) => {
          // Same fonts on both sides, or the comparison measures a font swap.
          await page.evaluate(() => document.fonts.ready.then(() => true));
          const root = page
            .locator("article")
            .filter({ has: page.locator('[data-slot="device-fit-slot"]') })
            .first();
          const slot = root.locator('[data-slot="device-fit-slot"]');
          return {
            slot: await slot.boundingBox(),
            price: await root.locator(".font-display").first().boundingBox(),
            button: await root.locator("button").first().boundingBox(),
          };
        };

        const before = await browser.newPage({ viewport });
        await saveDevice(before, deviceName);
        await blockHydration(before);
        await before.goto(url, { waitUntil: "domcontentloaded" });
        const pre = await boxes(before);
        await before.close();

        const after = await browser.newPage({ viewport });
        await saveDevice(after, deviceName);
        await after.goto(url);
        const mark = after.locator('[data-slot="device-fit-mark"]').first();
        await expect(mark).toBeVisible({ timeout: 30_000 });
        const post = await boxes(after);
        const markBox = await mark.boundingBox();
        const textBox = await mark.locator("span").last().boundingBox();
        await after.close();

        // The measurement TASK-2410 asks for: the slot, the mark in it, and the
        // spare space above a mark that needs fewer lines than the slot holds.
        const gapAbove = (markBox?.y ?? 0) - (post.slot?.y ?? 0);
        console.log(
          `[TASK-2410 @${label} «${deviceName}»] slot ${post.slot?.height}px (w ${post.slot?.width}), mark ${markBox?.height}px, text ${textBox?.height}px, gap above mark ${gapAbove}px`,
        );

        expect(post.slot?.height).toBe(pre.slot?.height);
        expect(post.price?.y).toBe(pre.price?.y);
        expect(post.button?.y).toBe(pre.button?.y);
      });
    }
  });
}
