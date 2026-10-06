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
 * TASK-656 screenshot harness — «Відновити» у виді «Видалені». Evidence for
 * the visual verifier, not a regression gate.
 *
 * SKIPPED unless `SCREENS_185` is set. Writes
 * `docs/images/185/656/<name>-page-{1440,390}.png`, one pair per state, to be
 * read next to the `ProductsProposal.dc.html` mockup shots (Т8…Т12, taken with
 * a stdin-token Playwright script — see .design-sync/NOTES.md).
 *
 *   E2E_API_PORT=3101 E2E_CLIENT_PORT=3100 E2E_ADMIN_PORT=3102 \
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/store_pw_185 \
 *   SCREENS_185=1 npx playwright test e2e/admin-screens-185-restore.spec.ts
 *
 * Use a database of its own, never the one the regular suite runs on: the
 * products this seeds stay behind and change catalogue counts
 * (`catalog-in-stock.spec.ts` expects exactly the e2e seed's two products).
 *
 * The committed set is webp (sharp, quality 80), converted after the run.
 *
 * Data: the artboard's three deleted products (Spigen / Nillkin / Baseus, with
 * their артикули, brands, categories, prices, stock and deletion dates),
 * written straight through Prisma and tombstoned exactly the way
 * `ProductService.delete` does it (`deleted:<id>:<value>`, `isActive: false`).
 * Every row carries {@link FIXTURE_MARK}; each state hard-deletes the previous
 * fixture first, so a product one state restored cannot leak into the next.
 * Т10 additionally seeds the live product that took the native address.
 */

const ENABLED = !!process.env.SCREENS_185;
const OUT_DIR = path.resolve(__dirname, "../docs/images/185/656");
const RENDER_TIMEOUT_MS = 30_000;
const FIXTURE_MARK = "TASK-656 screenshot fixture";

const VIEWPORTS = [
  ["1440", { width: 1440, height: 900 }],
  ["390", { width: 390, height: 844 }],
] as const;

interface DeletedRow {
  name: string;
  slug: string;
  sku: string;
  brand: string;
  category: string;
  price: string;
  stock: number;
  deletedAt: string;
  /**
   * TASK-1830: who deleted it — a staff user behind a `product.remove` row of
   * the action log. Omitted for the artboard's «Імпорт» row: a system delete
   * has no actor on record, so the list shows no second line there.
   */
  deletedBy?: { firstName: string; lastName: string; email: string };
}

/** The artboard's `DEL` rows, newest deletion first. */
const DELETED: DeletedRow[] = [
  {
    name: "Чохол Spigen Ultra Hybrid для iPhone 14 — Прозорий",
    slug: "spigen-ultra-hybrid-iphone-14-clear",
    sku: "CASE-SPG-UH-IP14-CL",
    brand: "Spigen",
    category: "Чохли для iPhone",
    price: "799.00",
    stock: 0,
    deletedAt: "2026-10-03T09:12:00Z",
    deletedBy: {
      firstName: "Олена",
      lastName: "Коваленко",
      email: "s656-olena@store.test",
    },
  },
  {
    name: "Захисне скло Nillkin для Galaxy S23",
    slug: "nillkin-glass-galaxy-s23",
    sku: "GLS-NLK-S23",
    brand: "Nillkin",
    category: "Захисне скло",
    price: "349.00",
    stock: 14,
    deletedAt: "2026-09-28T14:30:00Z",
    deletedBy: {
      firstName: "Андрій",
      lastName: "Мельник",
      email: "s656-andrii@store.test",
    },
  },
  {
    name: "Кабель Baseus USB-C — Lightning 1 м",
    slug: "baseus-cable-usb-c-lightning-1m",
    sku: "CBL-BSU-CL-1M",
    brand: "Baseus",
    category: "Зарядні пристрої",
    price: "299.00",
    stock: 0,
    deletedAt: "2026-09-15T11:05:00Z",
  },
];
const TARGET = DELETED[0];
/** Т10: the live product that took the native address meanwhile. */
const SQUATTER_NAME = `${TARGET.name} (2026)`;

test.skip(!ENABLED, "set SCREENS_185=1 to capture TASK-656 shots");

function withPrisma<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return fn(prisma).finally(() => prisma.$disconnect());
}

/** A stable fixture slug per label (FNV-1a — the labels are Cyrillic). */
function slugOf(label: string): string {
  let hash = 0x811c9dc5;
  for (const ch of label) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `s656-${hash.toString(16)}`;
}

/**
 * Drop the previous fixture and write a fresh one: three tombstones and,
 * with `squatter`, a live product on the first one's native address.
 */
async function seedDeleted({ squatter = false } = {}): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.product.deleteMany({ where: { description: FIXTURE_MARK } });
    await prisma.auditLog.deleteMany({ where: { summary: FIXTURE_MARK } });

    const ensureCategory = async (name: string) => {
      const slug = slugOf(name);
      const found = await prisma.category.findFirst({
        where: { slug, deletedAt: null },
      });
      return (
        found ??
        (await prisma.category.create({
          data: { name, slug, description: FIXTURE_MARK, isActive: true },
        }))
      );
    };
    const ensureBrand = async (name: string) =>
      prisma.brand.upsert({
        where: { slug: slugOf(name) },
        update: {},
        create: { name, slug: slugOf(name) },
      });

    for (const row of DELETED) {
      const category = await ensureCategory(row.category);
      const brand = await ensureBrand(row.brand);
      const created = await prisma.product.create({
        data: {
          name: row.name,
          slug: row.slug,
          sku: row.sku,
          description: FIXTURE_MARK,
          price: row.price,
          stock: row.stock,
          categoryId: category.id,
          brandId: brand.id,
          isActive: true,
        },
      });
      // Exactly `ProductRepository.softDelete`, dated like the artboard.
      const at = new Date(row.deletedAt);
      await prisma.product.update({
        where: { id: created.id },
        data: {
          deletedAt: at,
          updatedAt: at,
          isActive: false,
          slug: `deleted:${created.id}:${row.slug}`,
          sku: `deleted:${created.id}:${row.sku}`,
        },
      });
      if (row.deletedBy) {
        // TASK-1830: the list names the actor of the latest `product.remove`.
        const { email, firstName, lastName } = row.deletedBy;
        const actor = await prisma.user.upsert({
          where: { email },
          update: { firstName, lastName },
          create: { email, firstName, lastName, role: "MANAGER" },
        });
        await prisma.auditLog.create({
          data: {
            actorId: actor.id,
            actorEmail: email,
            actorRole: "MANAGER",
            action: "product.remove",
            entityType: "product",
            entityId: created.id,
            summary: FIXTURE_MARK,
            createdAt: at,
          },
        });
      }
    }

    if (squatter) {
      const category = await ensureCategory(TARGET.category);
      const brand = await ensureBrand(TARGET.brand);
      await prisma.product.create({
        data: {
          name: SQUATTER_NAME,
          slug: TARGET.slug,
          description: FIXTURE_MARK,
          price: "849.00",
          stock: 20,
          categoryId: category.id,
          brandId: brand.id,
          isActive: true,
        },
      });
    }
  });
}

function note(message: string): void {
  console.log(`[screens-185-656] ${message}`);
}

/**
 * A viewport shot: the admin shell scrolls an inner container, so a
 * `fullPage` shot would be byte-identical anyway.
 */
async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.png`),
    fullPage: false,
    animations: "disabled",
    caret: "hide",
  });
  note(`${name}.png written`);
}

const restoreButton = (page: Page, name: string) =>
  page.getByRole("button", { name: `Відновити «${name}»` });

/** «Видалені» with every seeded row on screen and hydrated. */
async function openDeletedView(page: Page): Promise<void> {
  await page.goto("/products?deleted=only");
  for (const row of DELETED) {
    await expect(restoreButton(page, row.name)).toBeVisible({
      timeout: RENDER_TIMEOUT_MS,
    });
  }
  await waitForHydration(restoreButton(page, TARGET.name));
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {
    // A background poll may keep the network busy; the shot is still valid.
  });
}

/** Row «Відновити» → Т9. */
async function openConfirm(page: Page) {
  await restoreButton(page, TARGET.name).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Відновити товар?")).toBeVisible();
  return dialog;
}

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test.beforeEach(() => {
  test.setTimeout(300_000);
});

for (const [size, viewport] of VIEWPORTS) {
  test.describe(`TASK-656 restore at ${size}`, () => {
    test.use({ viewport });

    test(`Т8/Т12 — deleted view, Т9 — confirm (${size})`, async ({ page }) => {
      await seedDeleted();
      await loginAsAdmin(page);
      await openDeletedView(page);
      await page.waitForTimeout(300);
      // TASK-1832 / TASK-1830: the view button's label and each row's date line.
      const viewButton = page.getByRole("button", { name: /Вид/ }).first();
      note(
        `${size} view button: «${(await viewButton.innerText()).trim()}» aria=${await viewButton.getAttribute("aria-label")}`,
      );
      const deletedLines = await page
        .getByText(/^видалено \d\d\.\d\d\.\d{4}/)
        .evaluateAll((els) =>
          els.map((el) => (el.parentElement?.textContent ?? "").trim()),
        );
      note(`${size} deleted lines: ${JSON.stringify(deletedLines)}`);
      await shot(page, `deleted-view-page-${size}`);

      await openConfirm(page);
      await page.waitForTimeout(300);
      await shot(page, `confirm-page-${size}`);
    });

    test(`Т10 — address taken (409) (${size})`, async ({ page }) => {
      await seedDeleted({ squatter: true });
      await loginAsAdmin(page);
      await openDeletedView(page);
      const confirm = await openConfirm(page);
      await confirm.getByRole("button", { name: "Відновити" }).click();
      const dialog = page.getByRole("dialog", { name: "Адреса вже зайнята" });
      await expect(dialog).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
      await expect(dialog.getByLabel(/Нова адреса/)).toHaveValue(
        `${TARGET.slug}-2`,
      );
      await page.waitForTimeout(300);
      await shot(page, `conflict-page-${size}`);
    });

    test(`Т11 — restored, toast (${size})`, async ({ page }) => {
      await seedDeleted();
      await loginAsAdmin(page);
      await openDeletedView(page);
      const confirm = await openConfirm(page);
      await confirm.getByRole("button", { name: "Відновити" }).click();
      await expect(
        page.getByText(/відновлено — він прихований\./).first(),
      ).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
      await expect(restoreButton(page, TARGET.name)).toHaveCount(0, {
        timeout: RENDER_TIMEOUT_MS,
      });
      await page.waitForTimeout(500);
      await shot(page, `restored-page-${size}`);
    });
  });
}
