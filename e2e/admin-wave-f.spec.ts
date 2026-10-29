import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect, type Page } from "./fixtures/test";
import { loginAsAdmin } from "./fixtures/admin-session";
import { waitForHydration } from "./fixtures/hydration";
import { E2E_CATEGORY_SLUG, E2E_PRODUCT_SLUG } from "./fixtures/seed-e2e";

/**
 * Wave F, admin half — layout regressions of the admin shell
 * (docs/reviews/2026-08-27-demo-run.md: D03, D08, D54). Each test asserts the
 * FIXED behaviour, so it was red before the wave landed.
 *
 *   - TASK-1989: switching a page's status to «Чернетка» and jumping to a form
 *     section must not shift the shell («вікно зсувається вгору»). Same anchor
 *     check on the product form, which shares FormSectionNav.
 *   - TASK-1993: the sticky «Зберегти зміни» bar sits flush on <main>'s bottom
 *     edge — <main>'s padding used to hold it 24px up.
 *   - TASK-1994: the registry header stays visible when the list is scrolled to
 *     its last row, and the page has ONE vertical scroller, not <main> plus the
 *     table box.
 *
 * `WAVE_F_SHOTS=before|after` additionally writes the defect moment to
 * `docs/images/wave-f/<mode>/<task>-<name>.png` — taken BEFORE the assertion,
 * so a red run still leaves its picture.
 *
 * Runs against `store_test`; set DATABASE_URL explicitly (TASK-1947 — the seed
 * would otherwise read apps/store-api/.env). Fixture rows carry FIXTURE_MARK
 * and are removed afterwards.
 */

const SHOTS = process.env.WAVE_F_SHOTS;
const SHOTS_DIR =
  SHOTS === "before" || SHOTS === "after"
    ? path.resolve(__dirname, "../docs/images/wave-f", SHOTS)
    : null;

const FIXTURE_MARK = "wave-f-e2e fixture";
const PAGE_SLUG = "wave-f-e2e-page";
const LIST_ROWS = 24;

/** Admin labels (`apps/store-admin/src/shared/config/dictionary.ts`). */
const DRAFT = "Чернетка";
const SEO_SECTION = /SEO і соцмережі$/;
const STATUS_GROUP = "Статус публікації";

function withPrisma<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return fn(prisma).finally(() => prisma.$disconnect());
}

async function shot(page: Page, task: number, name: string): Promise<void> {
  if (!SHOTS_DIR) return;
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SHOTS_DIR, `${task}-${name}.png`),
    animations: "disabled",
    caret: "hide",
  });
}

/**
 * Everything that «the window moved» can mean in this shell: the document
 * itself, and the two `overflow-hidden` wrappers around <main> — hidden
 * overflow is still programmatically scrollable, so a focus or an anchor can
 * shift them and drag the header off the top.
 */
function shellShift(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    let wrappers = 0;
    for (
      let el = main?.parentElement ?? null;
      el && el !== document.documentElement;
      el = el.parentElement
    ) {
      wrappers = Math.max(wrappers, el.scrollTop);
    }
    return {
      windowScrollY: window.scrollY,
      scrollingElementTop: document.scrollingElement?.scrollTop ?? 0,
      shellWrappersScrollTop: wrappers,
      headerTop: Math.round(
        document.querySelector("header")?.getBoundingClientRect().top ?? 0,
      ),
    };
  });
}

const NO_SHIFT = {
  windowScrollY: 0,
  scrollingElementTop: 0,
  shellWrappersScrollTop: 0,
  headerTop: 0,
};

async function openForm(page: Page, url: string): Promise<void> {
  await page.goto(url);
  const form = page.locator("main form").first();
  await expect(form).toBeVisible({ timeout: 30_000 });
  await waitForHydration(form);
  // The edit forms seed from a query; wait until a section index is drawn.
  await expect(
    page.getByRole("main").getByRole("link", { name: SEO_SECTION }),
  ).toBeVisible({ timeout: 30_000 });
}

async function seededProductId(): Promise<string> {
  return withPrisma(async (prisma) => {
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: E2E_PRODUCT_SLUG },
      select: { id: true },
    });
    return product.id;
  });
}

test.describe("wave F — admin layout", () => {
  let pageId = "";

  test.beforeAll(async () => {
    await withPrisma(async (prisma) => {
      await prisma.product.deleteMany({ where: { description: FIXTURE_MARK } });
      const page = await prisma.page.upsert({
        where: { kind_slug: { kind: "INFO", slug: PAGE_SLUG } },
        update: { status: "PUBLISHED", isActive: true, title: "Wave F page" },
        create: {
          kind: "INFO",
          slug: PAGE_SLUG,
          title: "Wave F page",
          content: `<p>${"Текст сторінки для перевірки верстки. ".repeat(40)}</p>`,
          excerpt: FIXTURE_MARK,
          status: "PUBLISHED",
          isActive: true,
          publishedAt: new Date(),
        },
      });
      pageId = page.id;

      // The products registry pages by 20: enough rows that the table is
      // taller than <main> on a 1280×720 screen.
      const category = await prisma.category.findUniqueOrThrow({
        where: { slug: E2E_CATEGORY_SLUG },
      });
      await prisma.product.createMany({
        data: Array.from({ length: LIST_ROWS }, (_, i) => ({
          name: `Wave F товар ${String(i + 1).padStart(2, "0")}`,
          slug: `wave-f-e2e-${i + 1}`,
          sku: `WAVE-F-${i + 1}`,
          description: FIXTURE_MARK,
          price: "199.00",
          stock: 5,
          categoryId: category.id,
          isActive: true,
        })),
      });
    });
  });

  test.afterAll(async () => {
    await withPrisma(async (prisma) => {
      await prisma.product.deleteMany({ where: { description: FIXTURE_MARK } });
      await prisma.page.deleteMany({
        where: { kind: "INFO", slug: PAGE_SLUG },
      });
    });
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsAdmin(page);
  });

  test("TASK-1989: «Чернетка» and the section anchors do not shift the shell (page form)", async ({
    page,
  }) => {
    await openForm(page, `/pages/${pageId}/edit`);

    const status = page
      .getByRole("radiogroup", { name: STATUS_GROUP })
      .locator("label", { hasText: DRAFT });
    await status.click();
    await expect(page.getByRole("radio", { name: DRAFT })).toBeChecked();

    const afterDraft = await shellShift(page);
    const bar = page.locator('[data-slot="form-actions-bar"]');
    const barBox = await bar.boundingBox();
    const viewport = page.viewportSize()!;
    await shot(page, 1989, "page-draft");
    expect.soft(afterDraft, "after «Чернетка»").toEqual(NO_SHIFT);
    const barEdges = barBox
      ? {
          top: Math.round(barBox.y),
          bottom: Math.round(barBox.y + barBox.height),
        }
      : null;
    expect
      .soft(
        barEdges !== null &&
          barEdges.top >= 0 &&
          barEdges.bottom <= viewport.height + 1,
        `«Зберегти зміни» bar ${JSON.stringify(barEdges)} inside the ${viewport.height}px viewport`,
      )
      .toBe(true);

    await page
      .getByRole("main")
      .getByRole("link", { name: SEO_SECTION })
      .click();
    await expect(page).toHaveURL(/#/);
    const afterAnchor = await shellShift(page);
    await shot(page, 1989, "page-anchor-seo");
    expect(afterAnchor, "after the «SEO і соцмережі» anchor").toEqual(NO_SHIFT);
  });

  test("TASK-1989: the section anchors do not shift the shell (product form)", async ({
    page,
  }) => {
    const productId = await seededProductId();
    await openForm(page, `/products/${productId}/edit`);

    await page
      .getByRole("main")
      .getByRole("link", { name: SEO_SECTION })
      .click();
    await expect(page).toHaveURL(/#/);
    const afterAnchor = await shellShift(page);
    await shot(page, 1989, "product-anchor-seo");
    expect(afterAnchor, "after the «SEO і соцмережі» anchor").toEqual(NO_SHIFT);
  });

  test("TASK-1993: the sticky form-actions bar sits on <main>'s bottom edge", async ({
    page,
  }) => {
    const productId = await seededProductId();
    await openForm(page, `/products/${productId}/edit`);

    const measure = () =>
      page.evaluate(() => {
        const main = document.querySelector("main")!;
        const bar = main.querySelector('[data-slot="form-actions-bar"]')!;
        return {
          scrollable: main.scrollHeight > main.clientHeight,
          gap: Math.round(
            main.getBoundingClientRect().bottom -
              bar.getBoundingClientRect().bottom,
          ),
        };
      });
    const scrollMain = (fraction: number) =>
      page.evaluate((f) => {
        const main = document.querySelector("main")!;
        main.scrollTop = (main.scrollHeight - main.clientHeight) * f;
      }, fraction);

    await scrollMain(0.5);
    const midway = await measure();
    expect(midway.scrollable, "the product form is taller than <main>").toBe(
      true,
    );
    await shot(page, 1993, "product-midway");

    await scrollMain(1);
    const atEnd = await measure();
    await shot(page, 1993, "product-end");

    // ±1px: sub-pixel rounding of the shell's heights.
    expect
      .soft(Math.abs(midway.gap), "gap below the bar, midway")
      .toBeLessThanOrEqual(1);
    expect(
      Math.abs(atEnd.gap),
      "gap below the bar, at the end",
    ).toBeLessThanOrEqual(1);
  });

  test("TASK-1994: the registry header stays visible on the last row, with one vertical scroller", async ({
    page,
  }) => {
    await page.goto("/products");
    const table = page.getByRole("main").locator("table").first();
    await expect(table).toBeVisible({ timeout: 30_000 });
    const rows = table.locator("tbody tr");
    await expect
      .poll(() => rows.count(), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(20);

    // What a wheel does: brings the last row into view through whichever
    // containers scroll.
    await rows.last().scrollIntoViewIfNeeded();
    await rows.last().evaluate((el) => el.scrollIntoView({ block: "end" }));

    const state = await table.evaluate((tableEl) => {
      const main = document.querySelector("main")!;
      const thead = tableEl.querySelector("thead")!;
      const box = tableEl.parentElement!;
      const scrollsY = (el: Element) => {
        const { overflowY } = getComputedStyle(el);
        return (
          (overflowY === "auto" || overflowY === "scroll") &&
          el.scrollHeight > el.clientHeight + 1
        );
      };
      const head = thead.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      // What is actually on screen: <main>'s box clipped to the viewport —
      // anything above <main>'s top is clipped by its overflow.
      const visibleTop = Math.max(mainRect.top, 0);
      const visibleBottom = Math.min(mainRect.bottom, window.innerHeight);
      return {
        header: { top: Math.round(head.top), bottom: Math.round(head.bottom) },
        visible: {
          top: Math.round(visibleTop),
          bottom: Math.round(visibleBottom),
        },
        headerVisible:
          head.top >= visibleTop - 1 && head.bottom <= visibleBottom + 1,
        verticalScrollers: [main, box].filter(scrollsY).length,
      };
    });
    await shot(page, 1994, "products-last-row");

    expect
      .soft(state.verticalScrollers, "vertical scrollers (main + table box)")
      .toBe(1);
    expect(
      state.headerVisible,
      `table header ${JSON.stringify(state.header)} inside the visible area ${JSON.stringify(state.visible)} at the last row`,
    ).toBe(true);
  });
});
