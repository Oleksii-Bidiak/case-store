#!/usr/bin/env node
/**
 * Screenshots for docs/admin-guide.md (TASK-714).
 *
 * Logs into a RUNNING admin panel and captures the screens the guide shows, into
 * docs/images/admin-guide/NN-name.jpg. Re-run it after a wave that changes the
 * panel, then eyeball the diff — the guide text is the source of truth, a
 * screenshot only illustrates it.
 *
 *   GUIDE_ADMIN_URL=https://admin.example.com \
 *   GUIDE_ADMIN_EMAIL=owner@example.com GUIDE_ADMIN_PASSWORD=… \
 *   node scripts/docs/admin-guide-screenshots.mjs [shot-name-filter]
 *
 * Credentials come only from the environment: never hardcode them here, and use
 * an OWNER account so every menu item is visible. Nothing is created or changed
 * on the target — every shot is a page load, a scroll or opening an existing row.
 * A shot whose row cannot be found is reported and skipped, not faked.
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.GUIDE_ADMIN_URL?.replace(/\/$/, "");
const EMAIL = process.env.GUIDE_ADMIN_EMAIL;
const PASSWORD = process.env.GUIDE_ADMIN_PASSWORD;
const FILTER = process.argv[2];
const OUT = path.resolve("docs/images/admin-guide");

if (!BASE || !EMAIL || !PASSWORD) {
  console.error(
    "Set GUIDE_ADMIN_URL, GUIDE_ADMIN_EMAIL and GUIDE_ADMIN_PASSWORD (owner account).",
  );
  process.exit(1);
}

/**
 * One entry per image. `open` clicks the first element matching a selector
 * (a row link) before capturing; `scrollTo` brings a heading into view; `element`
 * captures just that element instead of the viewport; `maskRows` paints over whole
 * table rows that carry a real mailbox; `viewport` overrides the
 * default window size for one shot.
 */
const SHOTS = [
  {
    name: "02-sidebar",
    path: "/",
    element: "aside",
    // Tall enough for the bottom group of the menu to be on screen.
    viewport: { width: 1440, height: 1500 },
  },
  { name: "03-dashboard-needs-action", path: "/" },
  { name: "04-dashboard-stats", path: "/", scrollTo: "Динаміка виручки" },
  { name: "05-products-list", path: "/products" },
  {
    name: "06-product-publish-panel",
    path: "/products",
    open: 'table tbody a[href$="/edit"]',
  },
  {
    name: "07-product-images",
    path: "/products",
    open: 'table tbody a[href$="/edit"]',
    scrollTo: "Зображення товару",
  },
  {
    name: "08-product-card",
    path: "/products",
    open: 'table tbody a[href^="/products/"]:not([href$="/edit"])',
  },
  { name: "09-catalog-import", path: "/catalog-import" },
  { name: "10-media", path: "/media" },
  { name: "12-categories-tree", path: "/categories" },
  { name: "14-product-groups", path: "/product-groups" },
  { name: "15-brands", path: "/brands" },
  { name: "16-addon-services", path: "/addon-services" },
  { name: "17-device-brands", path: "/devices/brands" },
  {
    name: "18-device-model-form",
    path: "/devices/models",
    open: 'table tbody a[href$="/edit"]',
    scrollTo: "Тексти сторінок сумісності",
  },
  { name: "20-orders", path: "/orders?status=" },
  {
    name: "21-order-detail",
    path: "/orders?status=",
    open: 'table tbody a[href^="/orders/"]',
  },
  { name: "22-order-new", path: "/orders/new" },
  { name: "23-returns", path: "/returns" },
  { name: "25-reviews", path: "/reviews" },
  { name: "26-users", path: "/users" },
  {
    name: "27-user-card",
    path: "/users",
    open: 'table tbody a[href^="/users/"]',
  },
  { name: "28-staff", path: "/staff", maskRows: true },
  {
    name: "29-staff-card",
    path: "/staff",
    // The demo owner, not whichever real person happens to be listed first.
    open: 'table tbody tr:has-text("case-store.demo") a[href^="/staff/"]',
  },
  { name: "30-staff-templates", path: "/staff/templates" },
  { name: "31-audit-log", path: "/audit-log" },
  { name: "32-profile", path: "/profile" },
  { name: "33-discounts", path: "/discounts" },
  { name: "34-discount-form", path: "/discounts/new" },
  { name: "35-pages", path: "/pages" },
  { name: "36-page-form", path: "/pages/new" },
  { name: "37-blog", path: "/blog" },
  { name: "38-blog-form", path: "/blog/new" },
  { name: "39-banners", path: "/banners" },
  { name: "40-banner-form", path: "/banners/new" },
  { name: "41-carousels", path: "/carousels" },
  { name: "42-content-map", path: "/content-map" },
  { name: "43-messages", path: "/messages" },
  { name: "44-subscribers", path: "/subscribers" },
  { name: "45-contacts", path: "/settings/contact" },
  { name: "46-seo", path: "/settings/seo" },
  { name: "47-faq", path: "/faq" },
  { name: "48-search-index", path: "/settings/search" },
];

const VIEWPORT = { width: 1440, height: 900 };

async function settle(page) {
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {});
  // Skeletons fade out after data lands; give them a beat.
  await page.waitForTimeout(800);
}

/**
 * Real people end up on a demo stand too (a developer testing the subscribe
 * form, a staff account created for a trial). Anything that looks like a real
 * mailbox is painted over — and, for shots marked `maskRows`, the whole table row
 * it sits in, so a real name next to it goes too. Demo data (store.com,
 * example.com, *.demo) stays readable.
 */
const REAL_MAILBOX =
  /@(gmail|ukr|i\.ua|meta\.ua|outlook|hotmail|yahoo|icloud|proton)\./i;

async function capture(page, file, opts = {}) {
  const target = opts.element ? page.locator(opts.element).first() : page;
  await target.screenshot({
    path: file,
    type: "jpeg",
    quality: 80,
    mask: [
      page.getByText(REAL_MAILBOX),
      // Whole rows only where a real person's name sits next to the address.
      ...(opts.maskRows
        ? [page.locator("tr").filter({ hasText: REAL_MAILBOX })]
        : []),
    ],
    maskColor: "#d4d4d8",
  });
}

const browser = await chromium.launch();
try {
  await mkdir(OUT, { recursive: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: "uk-UA",
  });
  const page = await context.newPage();

  // The login page itself, before signing in.
  await page.goto(`${BASE}/login`);
  await settle(page);
  if (!FILTER || "01-login".includes(FILTER)) {
    await capture(page, path.join(OUT, "01-login.jpg"));
    console.log("ok   01-login");
  }

  await page.getByLabel(/(електронна пошта|email)/i).fill(EMAIL);
  await page.getByLabel(/пароль/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^увійти$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 20_000,
  });

  for (const shot of SHOTS) {
    if (FILTER && !shot.name.includes(FILTER)) continue;
    try {
      await page.setViewportSize(shot.viewport ?? VIEWPORT);
      await page.goto(`${BASE}${shot.path}`);
      await settle(page);
      if (shot.open) {
        const link = page.locator(shot.open).first();
        await link.waitFor({ timeout: 10_000 });
        await link.click();
        await settle(page);
      }
      if (shot.scrollTo) {
        await page
          .getByText(shot.scrollTo, { exact: false })
          .first()
          .scrollIntoViewIfNeeded({ timeout: 10_000 });
        await page.waitForTimeout(300);
      }
      await capture(page, path.join(OUT, `${shot.name}.jpg`), shot);
      console.log(`ok   ${shot.name}`);
    } catch (error) {
      console.log(`skip ${shot.name}: ${error.message.split("\n")[0]}`);
    }
  }
} finally {
  await browser.close();
}
