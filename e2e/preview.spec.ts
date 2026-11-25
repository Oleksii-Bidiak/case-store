import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures/test";
import { API_PORT } from "./fixtures/ports";
// Importing the seed module also loads the API's env file, so DATABASE_URL is
// the same database the webServer-booted API reads.
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_CATEGORY_SLUG,
} from "./fixtures/seed-e2e";

/**
 * The signed storefront preview, end to end (TASK-669, plan 186).
 *
 * The owner issues a link in the API (`POST /api/admin/preview-tokens`), the
 * storefront's `/preview?token=…` asks the API whether it is good, turns Next
 * draft mode on and lands on the draft with the «Це прев'ю» bar and `noindex`.
 * Without the link the same address is a plain 404, and the homepage stays the
 * indexable page it always was.
 *
 * The draft is a LEGAL page created here (nothing else needs one) and removed
 * afterwards; a page is the lightest previewable thing — no category, stock or
 * images to set up.
 */
const API_ORIGIN = `http://localhost:${API_PORT}`;
const DRAFT_SLUG = "e2e-preview-draft";
const DRAFT_TITLE = "E2E Чернетка для прев'ю";

// One worker owns the draft row: `fullyParallel` would otherwise let one
// worker's afterAll delete it under another's test.
test.describe.configure({ mode: "serial" });

let pool: Pool;
let prisma: PrismaClient;
let draftId: string;
let hiddenProductId: string;

// TASK-2536 — a hidden product, previewed through a signed link.
const HIDDEN_SLUG = "e2e-preview-hidden-product";
const HIDDEN_NAME = "E2E Прихований товар для прев'ю";

test.beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const page = await prisma.page.upsert({
    where: { kind_slug: { kind: "LEGAL", slug: DRAFT_SLUG } },
    update: {
      title: DRAFT_TITLE,
      status: "DRAFT",
      publishedAt: null,
      scheduledAt: null,
    },
    create: {
      slug: DRAFT_SLUG,
      kind: "LEGAL",
      title: DRAFT_TITLE,
      content: "<p>Текст, якого покупці ще не бачать.</p>",
      status: "DRAFT",
    },
  });
  draftId = page.id;

  const category = await prisma.category.findUniqueOrThrow({
    where: { slug: E2E_CATEGORY_SLUG },
  });
  const product = await prisma.product.upsert({
    where: { slug: HIDDEN_SLUG },
    update: { isActive: false, deletedAt: null, categoryId: category.id },
    create: {
      name: HIDDEN_NAME,
      slug: HIDDEN_SLUG,
      description: "Товар, якого покупці не бачать.",
      price: "199.00",
      sku: "E2E-SKU-PREVIEW-HIDDEN",
      stock: 5,
      categoryId: category.id,
      isActive: false,
    },
  });
  hiddenProductId = product.id;
});

test.afterAll(async () => {
  await prisma.page.deleteMany({ where: { id: draftId } });
  await prisma.product.deleteMany({ where: { id: hiddenProductId } });
  await prisma.$disconnect();
});

async function issuePreviewLink(
  request: APIRequestContext,
  target: { type: "page" | "product"; id: string },
): Promise<{ token: string; path: string }> {
  const login = await request.post(`${API_ORIGIN}/api/auth/login`, {
    data: { email: E2E_ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD },
  });
  expect(login.ok()).toBe(true);
  const { accessToken } = (await login.json()).data as { accessToken: string };

  const issued = await request.post(`${API_ORIGIN}/api/admin/preview-tokens`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: target,
  });
  expect(issued.status()).toBe(201);
  return (await issued.json()).data as { token: string; path: string };
}

const noindexMeta = 'meta[name="robots"][content*="noindex"]';

test("a signed link opens the draft with the preview bar, noindex, and the exit ends it", async ({
  page,
  request,
}) => {
  const login = await request.post(`${API_ORIGIN}/api/auth/login`, {
    data: { email: E2E_ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD },
  });
  expect(login.ok()).toBe(true);
  const { accessToken } = (await login.json()).data as { accessToken: string };

  const issued = await request.post(`${API_ORIGIN}/api/admin/preview-tokens`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { type: "page", id: draftId },
  });
  expect(issued.status()).toBe(201);
  const { token, path } = (await issued.json()).data as {
    token: string;
    path: string;
  };
  expect(path).toBe(`/legal/${DRAFT_SLUG}`);

  await page.goto(`/preview?token=${encodeURIComponent(token)}`);

  await expect(page).toHaveURL(new RegExp(`/legal/${DRAFT_SLUG}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: DRAFT_TITLE }),
  ).toBeVisible();
  const bar = page.getByRole("region", { name: "Режим прев'ю" });
  await expect(bar).toBeVisible();
  await expect(bar).toContainText("Це прев'ю");
  await expect(page.locator(noindexMeta)).not.toHaveCount(0);

  // «Вийти з прев'ю» drops the preview and reloads the same address as a
  // shopper sees it — a draft, so not found.
  await bar.getByRole("link", { name: "Вийти з прев'ю" }).click();
  await expect(page).toHaveURL(new RegExp(`/legal/${DRAFT_SLUG}$`));
  await expect(page.getByRole("region", { name: "Режим прев'ю" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("heading", { name: DRAFT_TITLE })).toHaveCount(0);
});

test("without the link the draft is a 404 and the homepage stays indexable", async ({
  page,
}) => {
  const draft = await page.goto(`/legal/${DRAFT_SLUG}`);
  expect(draft?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: DRAFT_TITLE })).toHaveCount(0);

  const home = await page.goto("/");
  expect(home?.status()).toBe(200);
  await expect(page.getByRole("region", { name: "Режим прев'ю" })).toHaveCount(
    0,
  );
  await expect(page.locator(noindexMeta)).toHaveCount(0);
});

test("a refused link opens no preview: the public homepage under a note, noindex", async ({
  page,
}) => {
  await page.goto("/preview?token=not-a-real-token");

  await expect(page).toHaveURL(/\/preview\/invalid$/);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Посилання на прев'ю недійсне" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Режим прев'ю" })).toHaveCount(
    0,
  );
  await expect(page.locator(noindexMeta)).not.toHaveCount(0);

  // And the draft is still out of reach.
  const draft = await page.goto(`/legal/${DRAFT_SLUG}`);
  expect(draft?.status()).toBe(404);
});

// TASK-2536 (AD-PROD-79) — the browser cannot read a hidden product (its own
// request carries no token), so a long-open preview used to lose it to the
// store's re-reads: a tab return (stranded-query recovery refetches every
// active query) and Back/Forward (every query invalidated + router.refresh()).
test("a hidden product's preview survives a tab return and Back/Forward", async ({
  page,
  request,
}) => {
  const { token, path } = await issuePreviewLink(request, {
    type: "product",
    id: hiddenProductId,
  });
  expect(path).toBe(`/products/${HIDDEN_SLUG}`);

  await page.goto(`/preview?token=${encodeURIComponent(token)}`);
  await expect(page).toHaveURL(new RegExp(`/products/${HIDDEN_SLUG}$`));
  const heading = page.getByRole("heading", { level: 1, name: HIDDEN_NAME });
  await expect(heading).toBeVisible();

  // A shopper never sees it: the browser's own read is a 404.
  const publicRead = await request.get(
    `${API_ORIGIN}/api/products/${HIDDEN_SLUG}`,
  );
  expect(publicRead.status()).toBe(404);

  const productReads: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes(`/api/products/${HIDDEN_SLUG}`)) {
      productReads.push(req.url());
    }
  });

  // The tab goes to the background and comes back.
  await toggleTabVisibility(page);
  await page.waitForTimeout(1500);
  await expectPreviewIntact(page, heading);

  // Away through an in-page link, then Back, Forward and Back again.
  await page
    .getByRole("navigation", { name: "Навігаційний ланцюжок" })
    .getByRole("link", { name: "Товари", exact: true })
    .click();
  await expect(page).toHaveURL(/\/products$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/products/${HIDDEN_SLUG}$`));
  await page.waitForTimeout(1500);
  await expectPreviewIntact(page, heading);
  await page.goForward();
  await expect(page).toHaveURL(/\/products$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/products/${HIDDEN_SLUG}$`));
  await toggleTabVisibility(page);
  await page.waitForTimeout(3000);
  await expectPreviewIntact(page, heading);

  expect(productReads).toEqual([]);
});

// TASK-2558 (SF-PDP-45) — the PDP buy bar is drawn up to `lg`, so at 768–1023
// the preview bar must ride on top of it, not cover «Купити». From `lg` up the
// buy bar is hidden and the preview bar sits on the bottom edge. One link, one
// page: the spec shares the preview-token rate-limit budget.
test("on a product preview the bar rides above the buy bar up to lg", async ({
  page,
  request,
}) => {
  const { token } = await issuePreviewLink(request, {
    type: "product",
    id: hiddenProductId,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto(
    `/preview?token=${encodeURIComponent(token)}`,
  );
  await expect(page).toHaveURL(new RegExp(`/products/${HIDDEN_SLUG}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: HIDDEN_NAME }),
  ).toBeVisible();
  // The draft render is per-visitor: never stored by any cache, never indexed.
  // `no-store` only — the dev server sends just that; a production build sends
  // Next's `private, no-cache, no-store, max-age=0, must-revalidate`.
  expect(response?.headers()["cache-control"] ?? "").toContain("no-store");
  await expect(page.locator(noindexMeta)).not.toHaveCount(0);

  const previewBar = page.getByTestId("preview-bar");
  const buyBar = page.getByTestId("mobile-atc-bar");
  // 1023 is the last width with the buy bar (`lg:hidden` from 1024).
  for (const width of [390, 768, 1023]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(previewBar, `${width}`).toBeVisible();
    await expect(buyBar, `${width}`).toBeVisible();
    // The inset is published after the buy bar measures itself — poll.
    await expect
      .poll(
        async () => {
          const preview = await previewBar.boundingBox();
          const buy = await buyBar.boundingBox();
          if (!preview || !buy) return Number.POSITIVE_INFINITY;
          return preview.y + preview.height - buy.y;
        },
        { message: `preview bar above the buy bar at ${width}` },
      )
      .toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(buyBar).toBeHidden();
  await expect(previewBar).toBeVisible();
  await expect
    .poll(async () => {
      const preview = await previewBar.boundingBox();
      if (!preview) return Number.POSITIVE_INFINITY;
      return Math.abs(900 - (preview.y + preview.height));
    })
    .toBeLessThanOrEqual(1);
});

// TASK-2600 (AD-PROD-79) — draft mode bypasses Next's Data Cache and fetch
// dedupe, so every render read /api/seo-settings once per consumer (6 times),
// all into the storefront server's one throttler bucket (100/min/route): about
// the 17th render within a minute got a 429 and the strict layout read threw
// into «Щось пішло не так». One read per render keeps a long preview session —
// reloads included — far below that budget.
test("a preview survives a run of reloads without hitting the error page", async ({
  page,
  request,
}) => {
  const { token } = await issuePreviewLink(request, {
    type: "product",
    id: hiddenProductId,
  });

  await page.goto(`/preview?token=${encodeURIComponent(token)}`);
  await expect(page).toHaveURL(new RegExp(`/products/${HIDDEN_SLUG}$`));
  const heading = page.getByRole("heading", { level: 1, name: HIDDEN_NAME });
  await expectPreviewIntact(page, heading);

  // 20 full draft renders: 120 seo-settings reads without the fix.
  for (let render = 1; render <= 20; render++) {
    const response = await page.reload();
    expect(response?.status(), `render ${render}`).toBe(200);
    await expectPreviewIntact(page, heading);
  }
});

/** Background the tab and bring it back, as a tab switch does. */
async function toggleTabVisibility(page: Page): Promise<void> {
  await page.evaluate(() => {
    const set = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => state,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    set("hidden");
    set("visible");
  });
}

async function expectPreviewIntact(
  page: Page,
  heading: ReturnType<Page["getByRole"]>,
): Promise<void> {
  await expect(heading).toBeVisible();
  await expect(page.getByText("не вдалося завантажити цей товар")).toHaveCount(
    0,
  );
  await expect(page.getByText("Щось пішло не так")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Режим прев'ю" }),
  ).toBeVisible();
}
