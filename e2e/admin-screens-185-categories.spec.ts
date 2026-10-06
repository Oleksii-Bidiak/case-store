import * as fs from "node:fs";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect, type Page } from "./fixtures/test";
import { loginAsAdmin } from "./fixtures/admin-session";
import { waitForHydration } from "./fixtures/hydration";

// Same env source as the other fixtures: an inline DATABASE_URL wins (dotenv
// never overrides), and that is how this harness is meant to be run.
loadEnv({ path: path.resolve(__dirname, "../apps/store-api/.env") });

/**
 * TASK-655 screenshot harness — «Видалити категорію». Evidence for the visual
 * verifier, not a regression gate.
 *
 * SKIPPED unless `SCREENS_185` is set. Writes
 * `docs/images/185/655/<name>-page-{1440,390}.png`, one pair per state, to be
 * read next to the `CategoryDelete.dc.html` mockup shots (ДН-2.1…2.12, taken
 * with a stdin-token Playwright script — see .design-sync/NOTES.md).
 *
 *   E2E_API_PORT=3101 E2E_CLIENT_PORT=3100 E2E_ADMIN_PORT=3102 \
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/store_pw_185 \
 *   SCREENS_185=1 npx playwright test e2e/admin-screens-185-categories.spec.ts
 *
 * Use a database of its own, never the one the regular suite runs on: the
 * tree and products this seeds stay behind and change catalogue counts
 * (`catalog-in-stock.spec.ts` expects exactly the e2e seed's two products).
 *
 * The committed set is webp (sharp, quality 80), converted after the run.
 *
 * Data: the mockup's tree (Смартфони / Навушники / Чохли / Захисне скло та
 * плівки / Аксесуари, with the same leaves and product counts, one carousel
 * «Навушники тижня» on Навушники), written straight through Prisma. Every row
 * carries {@link FIXTURE_MARK}; before each state the previous fixture is
 * tombstoned (categories, the way the API does it) or deleted (its products and
 * carousel), so a state that really deleted a branch cannot leak into the next.
 *
 * States the API cannot be made to produce on demand are forced in the browser:
 * the busy state holds the DELETE open, the error state answers it with
 * 409 CATEGORY_TREE_STALE, and «без categories:write» rewrites the
 * `/auth/me/permissions` answer (the data requests still go out as the admin).
 */

const ENABLED = !!process.env.SCREENS_185;
const OUT_DIR = path.resolve(__dirname, "../docs/images/185/655");
const RENDER_TIMEOUT_MS = 30_000;
const FIXTURE_MARK = "TASK-655 screenshot fixture";

const VIEWPORTS = [
  ["1440", { width: 1440, height: 900 }],
  ["390", { width: 390, height: 844 }],
] as const;

type Leaf = { name: string; slug: string; products: number; active?: boolean };
type Root = { name: string; slug: string; active?: boolean; children: Leaf[] };

/** The mockup's tree, top to bottom. */
const TREE: Root[] = [
  {
    name: "Смартфони",
    slug: "smartphones",
    children: [
      { name: "iPhone", slug: "iphone", products: 19 },
      { name: "Samsung Galaxy", slug: "samsung-phones", products: 6 },
    ],
  },
  {
    name: "Навушники",
    slug: "headphones",
    active: false,
    children: [
      { name: "Бездротові вкладиші (TWS)", slug: "tws-earbuds", products: 8 },
      {
        name: "Накладні та повнорозмірні",
        slug: "over-ear-headphones",
        products: 4,
      },
      { name: "Дротові", slug: "wired-headphones", products: 3 },
    ],
  },
  {
    name: "Чохли",
    slug: "cases",
    children: [
      { name: "Чохли для iPhone", slug: "iphone-cases", products: 15 },
      { name: "Чохли для Samsung", slug: "samsung-cases", products: 9 },
      { name: "Чохли для Xiaomi", slug: "xiaomi-cases", products: 6 },
      {
        name: "Чохли для Pixel",
        slug: "pixel-cases",
        products: 0,
        active: false,
      },
    ],
  },
  {
    name: "Захисне скло та плівки",
    slug: "screen-protectors",
    children: [
      { name: "Захисне скло", slug: "tempered-glass", products: 8 },
      { name: "Плівки", slug: "films", products: 6 },
    ],
  },
  {
    name: "Аксесуари",
    slug: "accessories",
    children: [
      { name: "Аудіоаксесуари", slug: "audio-accessories", products: 7 },
      { name: "Зарядні пристрої", slug: "chargers", products: 15 },
    ],
  },
];
const CAROUSEL_TITLE = "Навушники тижня";

test.skip(!ENABLED, "set SCREENS_185=1 to capture TASK-655 shots");

function withPrisma<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return fn(prisma).finally(() => prisma.$disconnect());
}

/** Category ids by slug, from the latest {@link seedTree}. */
type Seeded = Record<string, string>;

/**
 * Retire the previous fixture and write a fresh one. Categories are tombstoned
 * exactly as `CategoryRepository` does it (slug mangled to `deleted:<id>:<slug>`),
 * which frees the mockup's slugs without touching anything this spec did not make.
 */
async function seedTree(): Promise<Seeded> {
  const run = Date.now().toString(36);
  return withPrisma(async (prisma) => {
    const old = await prisma.category.findMany({
      where: { description: FIXTURE_MARK, deletedAt: null },
      select: { id: true, slug: true },
    });
    const oldIds = old.map((c) => c.id);
    await prisma.carousel.deleteMany({
      where: {
        OR: [{ title: CAROUSEL_TITLE }, { categoryId: { in: oldIds } }],
      },
    });
    await prisma.product.deleteMany({ where: { description: FIXTURE_MARK } });
    const now = new Date();
    for (const c of old) {
      await prisma.category.update({
        where: { id: c.id },
        data: {
          deletedAt: now,
          isActive: false,
          slug: `deleted:${c.id}:${c.slug}`,
        },
      });
    }

    const ids: Seeded = {};
    let order = 900;
    for (const root of TREE) {
      const parent = await prisma.category.create({
        data: {
          name: root.name,
          slug: root.slug,
          description: FIXTURE_MARK,
          isActive: root.active ?? true,
          sortOrder: order++,
        },
      });
      ids[root.slug] = parent.id;
      let childOrder = 0;
      for (const leaf of root.children) {
        const child = await prisma.category.create({
          data: {
            name: leaf.name,
            slug: leaf.slug,
            description: FIXTURE_MARK,
            parentId: parent.id,
            isActive: leaf.active ?? true,
            sortOrder: childOrder++,
          },
        });
        ids[leaf.slug] = child.id;
        if (leaf.products > 0) {
          await prisma.product.createMany({
            data: Array.from({ length: leaf.products }, (_, i) => ({
              name: `${leaf.name} — товар ${i + 1}`,
              slug: `s655-${leaf.slug}-${i + 1}-${run}`,
              description: FIXTURE_MARK,
              price: "499.00",
              stock: 10,
              categoryId: child.id,
              isActive: true,
            })),
          });
        }
      }
    }
    await prisma.carousel.create({
      data: {
        title: CAROUSEL_TITLE,
        source: "CATEGORY",
        categoryId: ids.headphones,
      },
    });
    return ids;
  });
}

function note(message: string): void {
  console.log(`[screens-185-655] ${message}`);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.png`),
    fullPage: false,
    animations: "disabled",
    caret: "hide",
  });
  note(`${name}.png written`);
}

/** Owner session with the permission answer narrowed to delete-only (ДН-2.6). */
async function narrowPermissions(page: Page): Promise<void> {
  await page.route("**/api/auth/me/permissions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          role: "MANAGER",
          isOwner: false,
          isAdmin: false,
          permissions: ["categories:delete", "products:read"],
          entries: [],
        },
      }),
    }),
  );
}

async function openTree(page: Page): Promise<void> {
  await page.goto("/categories");
  const trigger = rowMenu(page, "Навушники");
  await expect(trigger).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
  await waitForHydration(trigger);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {
    // A background poll may keep the network busy; the shot is still valid.
  });
}

const rowMenu = (page: Page, name: string) =>
  page.getByRole("button", { name: `Дії: „${name}“` }).first();

async function openRowMenu(page: Page, name: string): Promise<void> {
  const trigger = rowMenu(page, name);
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await expect(page.getByRole("menuitem", { name: "Видалити…" })).toBeVisible();
}

/** Tree «⋯» → «Видалити…» → the dialog with its numbers loaded. */
async function openDialog(page: Page, name: string) {
  await openRowMenu(page, name);
  await page.getByRole("menuitem", { name: "Видалити…" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Що станеться")).toBeVisible({
    timeout: RENDER_TIMEOUT_MS,
  });
  return dialog;
}

async function pickTarget(page: Page, label: string): Promise<void> {
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("combobox").first().click();
  await targetOption(page, label).click();
  await expect(dialog.getByText(/переїдуть у/)).toBeVisible();
}

/**
 * An option's accessible name carries its product count («Аудіоаксесуари
 * 7 тов.»), so match the label as a prefix rather than the whole name.
 */
const targetOption = (page: Page, label: string) =>
  page.getByRole("option", {
    name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`),
  });

/** Hold the DELETE open (busy) or answer it with a canned refusal (error). */
async function routeDelete(
  page: Page,
  answer: "hold" | { status: number; error: string; message: string },
): Promise<void> {
  await page.route("**/api/admin/categories/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    if (answer === "hold") return; // never answered: the dialog stays busy
    await route.fulfill({
      status: answer.status,
      contentType: "application/json",
      body: JSON.stringify({ ...answer, statusCode: answer.status }),
    });
  });
}

const confirmButton = (page: Page) =>
  page.getByRole("alertdialog").getByRole("button", { name: /^Видалити/ });

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test.beforeEach(() => {
  test.setTimeout(300_000);
});

for (const [size, viewport] of VIEWPORTS) {
  test.describe(`TASK-655 delete dialog at ${size}`, () => {
    test.use({ viewport });

    test(`ДН-2.1…2.5, 2.7 — tree menu through busy (${size})`, async ({
      page,
    }) => {
      await seedTree();
      await loginAsAdmin(page);
      await openTree(page);

      await openRowMenu(page, "Навушники");
      await shot(page, `tree-menu-page-${size}`);
      await page.keyboard.press("Escape");

      const dialog = await openDialog(page, "Навушники");
      await page.waitForTimeout(300);
      await shot(page, `dialog-no-target-page-${size}`);

      await dialog.getByRole("combobox").first().click();
      await expect(page.getByRole("option").first()).toBeVisible();
      await shot(page, `select-open-page-${size}`);
      await targetOption(page, "Аудіоаксесуари").click();
      await expect(dialog.getByText(/переїдуть у/)).toBeVisible();
      await page.waitForTimeout(200);
      await shot(page, `target-picked-page-${size}`);
      if (size === "390") {
        await dialog.evaluate((el) => el.scrollTo(0, el.scrollHeight));
        await page.waitForTimeout(200);
        await shot(page, `target-picked-bottom-page-${size}`);
        await dialog.evaluate((el) => el.scrollTo(0, 0));
      }

      await dialog.getByRole("radio", { name: "Створити нову" }).click();
      await dialog.getByLabel(/Назва нової категорії/).fill("Аудіо");
      await expect(
        dialog.getByText(/нова, у корені каталогу/).first(),
      ).toBeVisible();
      await page.waitForTimeout(200);
      await shot(page, `new-mode-page-${size}`);

      await dialog.getByRole("radio", { name: "В існуючу категорію" }).click();
      await pickTarget(page, "Аудіоаксесуари");
      await routeDelete(page, "hold");
      await confirmButton(page).click();
      await expect(dialog.getByText("Видаляємо…")).toBeVisible();
      await page.waitForTimeout(300);
      await shot(page, `busy-page-${size}`);
    });

    test(`ДН-2.6 — new mode locked without categories:write (${size})`, async ({
      page,
    }) => {
      await seedTree();
      await loginAsAdmin(page);
      await narrowPermissions(page);
      await openTree(page);
      const dialog = await openDialog(page, "Навушники");
      await expect(
        dialog.getByRole("radio", { name: /Створити нову/ }),
      ).toBeDisabled();
      await pickTarget(page, "Аудіоаксесуари");
      await page.waitForTimeout(200);
      await shot(page, `new-locked-page-${size}`);
    });

    test(`ДН-2.8 — 409 tree stale keeps the choice (${size})`, async ({
      page,
    }) => {
      await seedTree();
      await loginAsAdmin(page);
      await openTree(page);
      const dialog = await openDialog(page, "Навушники");
      await pickTarget(page, "Аудіоаксесуари");
      await routeDelete(page, {
        status: 409,
        error: "CATEGORY_TREE_STALE",
        message: "Category tree changed while deleting",
      });
      await confirmButton(page).click();
      await expect(dialog.getByText("Не вдалося видалити.")).toBeVisible();
      await page.waitForTimeout(500);
      await shot(page, `error-page-${size}`);
      if (size === "390") {
        await dialog.evaluate((el) => el.scrollTo(0, el.scrollHeight));
        await page.waitForTimeout(200);
        await shot(page, `error-bottom-page-${size}`);
      }
    });

    test(`ДН-2.9 — empty category, no target (${size})`, async ({ page }) => {
      await seedTree();
      await loginAsAdmin(page);
      await openTree(page);
      const dialog = await openDialog(page, "Чохли для Pixel");
      await expect(dialog.getByRole("radio")).toHaveCount(0);
      await page.waitForTimeout(200);
      await shot(page, `empty-page-${size}`);
    });

    test(`ДН-2.11 — after delete, branch gone and toast (${size})`, async ({
      page,
    }) => {
      await seedTree();
      await loginAsAdmin(page);
      await openTree(page);
      await openDialog(page, "Навушники");
      await pickTarget(page, "Аудіоаксесуари");
      await confirmButton(page).click();
      await expect(
        page.getByText(/Категорію «Навушники» видалено/),
      ).toBeVisible({
        timeout: RENDER_TIMEOUT_MS,
      });
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await expect(rowMenu(page, "Навушники")).toHaveCount(0);
      await page.waitForTimeout(500);
      await shot(page, `after-delete-page-${size}`);
    });

    test(`ДН-2.12 — card trigger (${size})`, async ({ page }) => {
      const ids = await seedTree();
      await loginAsAdmin(page);
      await page.goto(`/categories/${ids.headphones}/edit`);
      const trigger = page.getByRole("button", { name: "Видалити…" });
      await expect(trigger).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
      await waitForHydration(trigger);
      await page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch(() => {
          // The shot is still valid with a background request in flight.
        });
      await shot(page, `card-trigger-page-${size}`);
      await trigger.click();
      await expect(
        page.getByRole("alertdialog").getByText("Що станеться"),
      ).toBeVisible({
        timeout: RENDER_TIMEOUT_MS,
      });
      await page.waitForTimeout(300);
      await shot(page, `card-dialog-page-${size}`);
    });
  });
}
