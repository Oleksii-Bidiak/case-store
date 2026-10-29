import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect } from "./fixtures/test";
import { API_PORT } from "./fixtures/ports";
// Importing the seed module also loads the API's env file, so DATABASE_URL is
// the same database the webServer-booted API reads.
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./fixtures/seed-e2e";

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
});

test.afterAll(async () => {
  await prisma.page.deleteMany({ where: { id: draftId } });
  await prisma.$disconnect();
});

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
