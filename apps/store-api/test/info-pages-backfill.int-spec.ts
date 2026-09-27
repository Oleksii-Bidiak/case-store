import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../src/prisma';
import { SINGLETON_ID as SEO_SINGLETON_ID } from '../src/seo-settings/seo-settings.repository';
import { pagesData } from '../prisma/seed/data/content/pages.data';

/**
 * The /info section pages backfill, against a REAL Postgres (TASK-560).
 *
 * `20260926110000_backfill_info_pages` inserts the four INFO pages the /info hub
 * renders its blocks from (delivery, payment, warranty, «про нас у цифрах»).
 * The `.sql` that ships is read off disk, split and executed as written — so a
 * `WHERE` that matches nothing, the silent no-op this project has shipped
 * before, fails HERE rather than on the demo stand. Every scenario runs inside a
 * rolled-back transaction, so nothing leaks into or out of the shared test DB.
 */
const MIGRATION_SQL = join(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20260926110000_backfill_info_pages',
  'migration.sql',
);

const SECTION_SLUGS = ['info-delivery', 'info-payment', 'info-warranty', 'info-about-stats'];

function migrationStatements(): string[] {
  return readFileSync(MIGRATION_SQL, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

type Tx = Prisma.TransactionClient;

interface PageRow {
  slug: string;
  kind: string;
  title: string;
  content: string;
  excerpt: string | null;
  meta_title: string | null;
  status: string;
  is_active: boolean;
  sort_order: number;
}

const ROLLBACK = new Error('rollback');

describe('/info section pages backfill migration (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  async function inRolledBackTx(body: (tx: Tx) => Promise<void>): Promise<void> {
    await prisma
      .$transaction(
        async (tx) => {
          await body(tx);
          throw ROLLBACK;
        },
        { timeout: 60_000, maxWait: 20_000 },
      )
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error;
      });
  }

  async function runMigration(tx: Tx): Promise<void> {
    for (const statement of migrationStatements()) {
      await tx.$executeRawUnsafe(statement);
    }
  }

  async function insertPage(
    tx: Tx,
    page: { slug: string; kind?: string; title?: string; content?: string },
    sortOrder: number,
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `INSERT INTO "pages" ("id", "slug", "kind", "title", "content", "status",
         "published_at", "is_active", "sort_order", "updated_at")
       VALUES (gen_random_uuid()::text, $1, $2::"PageKind", $3, $4, 'PUBLISHED', now(), true, $5, now())`,
      page.slug,
      page.kind ?? 'LEGAL',
      page.title ?? page.slug,
      page.content ?? `<p>${page.slug}</p>`,
      sortOrder,
    );
  }

  /** The shape of a stand before this wave: «Про нас», legal documents, hubs. */
  async function buildExistingStand(tx: Tx): Promise<void> {
    await tx.$executeRawUnsafe('DELETE FROM "pages"');
    await insertPage(tx, { slug: 'about', kind: 'INFO' }, 0);
    await insertPage(tx, { slug: 'delivery' }, 1);
    await insertPage(tx, { slug: 'warranty' }, 2);
    await insertPage(tx, { slug: 'info', kind: 'HUB' }, 3);
  }

  async function setSiteName(tx: Tx, siteName: string | null): Promise<void> {
    await tx.$executeRawUnsafe(
      `INSERT INTO "seo_settings" ("id", "site_name", "updated_at") VALUES ($1, $2, now())
       ON CONFLICT ("id") DO UPDATE SET "site_name" = EXCLUDED."site_name"`,
      SEO_SINGLETON_ID,
      siteName,
    );
  }

  async function rows(tx: Tx): Promise<PageRow[]> {
    return tx.$queryRawUnsafe<PageRow[]>(
      `SELECT "slug", "kind"::text AS "kind", "title", "content", "excerpt", "meta_title",
              "status"::text AS "status", "is_active", "sort_order"
       FROM "pages" ORDER BY "kind", "slug"`,
    );
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('inserts the four section pages, published, after the existing rows', async () => {
    await inRolledBackTx(async (tx) => {
      await buildExistingStand(tx);
      await setSiteName(tx, 'Мій магазин');
      const before = await rows(tx);
      expect(before.filter((row) => SECTION_SLUGS.includes(row.slug))).toEqual([]);

      await runMigration(tx);

      const after = await rows(tx);
      const sections = after.filter((row) => SECTION_SLUGS.includes(row.slug));
      expect(sections.map((row) => row.slug).sort()).toEqual([...SECTION_SLUGS].sort());
      for (const row of sections) {
        expect(row.kind).toBe('INFO');
        expect(row.status).toBe('PUBLISHED');
        expect(row.is_active).toBe(true);
        // Past the last existing row (3), so the /legal hub order is untouched.
        expect(row.sort_order).toBeGreaterThan(3);
        expect(row.meta_title).toBe(`${row.title} | Мій магазин`);
      }
      // The legal documents with the same words in their slugs are left alone.
      expect(after.filter((row) => row.kind === 'LEGAL').map((row) => row.slug)).toEqual([
        'delivery',
        'warranty',
      ]);
    });
  });

  it('writes the same texts the seed does — a migrated stand reads like a seeded one', async () => {
    await inRolledBackTx(async (tx) => {
      await buildExistingStand(tx);

      await runMigration(tx);

      const bySlug = new Map((await rows(tx)).map((row) => [row.slug, row]));
      for (const slug of SECTION_SLUGS) {
        const seeded = pagesData.find((page) => page.slug === slug);
        expect(seeded).toBeDefined();
        expect(bySlug.get(slug)?.title).toBe(seeded?.title);
        expect(bySlug.get(slug)?.content).toBe(seeded?.content);
        expect(bySlug.get(slug)?.excerpt ?? '').toBe(seeded?.excerpt ?? '');
      }
    });
  });

  it('never overwrites an INFO page the owner already wrote under one of the slugs', async () => {
    await inRolledBackTx(async (tx) => {
      await buildExistingStand(tx);
      await insertPage(
        tx,
        { slug: 'info-delivery', kind: 'INFO', title: 'Доставка (власник)', content: '<p>Моє</p>' },
        4,
      );

      await runMigration(tx);

      const delivery = (await rows(tx)).filter((row) => row.slug === 'info-delivery');
      expect(delivery).toHaveLength(1);
      expect(delivery[0].title).toBe('Доставка (власник)');
      expect(delivery[0].content).toBe('<p>Моє</p>');
    });
  });

  it('inserts nothing into an empty table — the seed builds that database', async () => {
    await inRolledBackTx(async (tx) => {
      await tx.$executeRawUnsafe('DELETE FROM "pages"');

      await runMigration(tx);

      expect(await rows(tx)).toEqual([]);
    });
  });

  it('is idempotent — a second run changes nothing', async () => {
    await inRolledBackTx(async (tx) => {
      await buildExistingStand(tx);
      await runMigration(tx);
      const once = await rows(tx);

      await runMigration(tx);

      expect(await rows(tx)).toEqual(once);
    });
  });
});
