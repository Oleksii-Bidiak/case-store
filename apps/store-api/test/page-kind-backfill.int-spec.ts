import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HUB_SLUGS } from '../src/pages/hub-routes';
import { PrismaService } from '../src/prisma';
import { SINGLETON_ID as SEO_SINGLETON_ID } from '../src/seo-settings/seo-settings.repository';

/**
 * The page-kind backfill, against a REAL Postgres (TASK-733).
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * `20260912150718_add_page_kind` gave every existing page `kind = 'LEGAL'` by
 * column default. On a database created before wave 176 that left «Про нас»
 * under `/legal/about` and no HUB row at all — the demo stand's content map read
 * «Довідкові 0 / Хаби 0». `20260925200000_backfill_page_kinds` repairs it.
 *
 * ── Why the migration file is read off disk ─────────────────────────────────
 * `store_test` is schema-synced (`prisma db push`), so migrations do not run
 * here. The `.sql` that ships is read, split and executed as written, so a
 * malformed statement — or a `WHERE` that matches nothing, the silent no-op this
 * project has shipped before (plans 180/181) — fails HERE. Every scenario first
 * asserts the pre-backfill state and then that the migration CHANGED it.
 *
 * ── Why every scenario runs in a rolled-back transaction ────────────────────
 * `pages.slug` is unique, and the backfill's subject is exactly the fixed slugs
 * (`about`, `promo`, …) that any other row in a shared test database could
 * hold. Each scenario therefore empties `pages` INSIDE an interactive
 * transaction, builds its state, runs the migration and rolls everything back —
 * nothing leaks in or out. Postgres DDL is transactional too, which is what
 * lets one scenario force either slug-uniqueness regime (global, or per kind
 * after TASK-566) regardless of the schema this database was pushed with.
 */

const MIGRATION_SQL = join(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20260925200000_backfill_page_kinds',
  'migration.sql',
);

/**
 * Split the migration into executable statements: `$executeRawUnsafe` takes one
 * command at a time. The migration header promises no `;` inside a literal.
 */
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
  kind: 'LEGAL' | 'INFO' | 'HUB';
  title: string;
  content: string;
  excerpt: string | null;
  meta_title: string | null;
  meta_description: string | null;
  status: string;
  is_active: boolean;
  published_at: Date | null;
}

/** The pre-wave-176 seed: `about` plus six legal documents, all LEGAL by default. */
const PRE_176_SLUGS = [
  'about',
  'delivery',
  'returns',
  'warranty',
  'privacy-policy',
  'terms',
  'offer',
] as const;
const LEGAL_SLUGS = PRE_176_SLUGS.filter((slug) => slug !== 'about');

const ABOUT_TITLE = 'Про нас (текст власника)';
const ABOUT_CONTENT = '<p>Текст, який власник редагував до хвилі 176.</p>';
const OPERATOR_PROMO_CONTENT = '<p>Весняний розпродаж — документ оператора.</p>';

const ROLLBACK = new Error('rollback');

describe('Page kinds on a pre-wave-176 database: backfill migration (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  /** Run `body` in a transaction that is always rolled back. */
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
        if (error !== ROLLBACK) {
          throw error;
        }
      });
  }

  async function runMigration(tx: Tx): Promise<void> {
    for (const statement of migrationStatements()) {
      await tx.$executeRawUnsafe(statement);
    }
  }

  async function insertPage(
    tx: Tx,
    page: { slug: string; kind?: string; title?: string; content?: string; metaTitle?: string },
    sortOrder: number,
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `INSERT INTO "pages" ("id", "slug", "kind", "title", "content", "meta_title", "status",
         "published_at", "is_active", "sort_order", "updated_at")
       VALUES (gen_random_uuid()::text, $1, $2::"PageKind", $3, $4, $5, 'PUBLISHED', now(), true, $6, now())`,
      page.slug,
      page.kind ?? 'LEGAL',
      page.title ?? page.slug,
      page.content ?? `<p>${page.slug}</p>`,
      page.metaTitle ?? null,
      sortOrder,
    );
  }

  /**
   * Empty `pages` and rebuild the state an OLD database is in: the seven rows
   * the pre-176 seed wrote, every one LEGAL by the column default, no hubs.
   */
  async function buildPre176(tx: Tx, options: { operatorPromo?: boolean } = {}): Promise<void> {
    await tx.$executeRawUnsafe('DELETE FROM "pages"');
    for (const [index, slug] of PRE_176_SLUGS.entries()) {
      await insertPage(
        tx,
        slug === 'about' ? { slug, title: ABOUT_TITLE, content: ABOUT_CONTENT } : { slug },
        index,
      );
    }
    if (options.operatorPromo) {
      // A document an operator wrote at /legal/promo before `promo` was a hub.
      await insertPage(
        tx,
        { slug: 'promo', title: 'Весняний розпродаж', content: OPERATOR_PROMO_CONTENT },
        PRE_176_SLUGS.length,
      );
    }
  }

  /**
   * Force one slug-uniqueness regime for the rest of the transaction, whichever
   * the database was pushed with: `global` = `slug` unique on its own (today),
   * `per-kind` = unique on `(kind, slug)` (TASK-566).
   */
  async function forceSlugUniqueness(tx: Tx, regime: 'global' | 'per-kind'): Promise<void> {
    const slugOnlyUnique = await tx.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT cls.relname AS name
       FROM pg_index idx
       JOIN pg_class cls ON cls.oid = idx.indexrelid
       JOIN pg_attribute col ON col.attrelid = idx.indrelid AND col.attnum = idx.indkey[0]
       WHERE idx.indrelid = '"pages"'::regclass AND idx.indisunique
         AND idx.indnatts = 1 AND col.attname = 'slug'`,
    );
    if (regime === 'per-kind') {
      for (const { name } of slugOnlyUnique) {
        await tx.$executeRawUnsafe(`DROP INDEX "${name}"`);
      }
      await tx.$executeRawUnsafe(
        'CREATE UNIQUE INDEX IF NOT EXISTS "pages_kind_slug_733_tmp" ON "pages" ("kind", "slug")',
      );
    } else if (slugOnlyUnique.length === 0) {
      await tx.$executeRawUnsafe('CREATE UNIQUE INDEX "pages_slug_733_tmp" ON "pages" ("slug")');
    }
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
              "meta_description", "status"::text AS "status", "is_active", "published_at"
       FROM "pages" ORDER BY "kind", "slug"`,
    );
  }

  async function kindCounts(tx: Tx): Promise<Record<string, number>> {
    const counts: Record<string, number> = { LEGAL: 0, INFO: 0, HUB: 0 };
    for (const row of await rows(tx)) {
      counts[row.kind] += 1;
    }
    return counts;
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

  it('moves «Про нас» to INFO and fills all six hubs on a pre-wave-176 database', async () => {
    await inRolledBackTx(async (tx) => {
      await forceSlugUniqueness(tx, 'global');
      await setSiteName(tx, 'Тест-Стор');
      await buildPre176(tx);

      // The defect, reproduced: the content map's «Довідкові 0 / Хаби 0».
      expect(await kindCounts(tx)).toEqual({ LEGAL: 7, INFO: 0, HUB: 0 });

      await runMigration(tx);

      // Not a silent no-op: the counts in the migration header, exactly.
      expect(await kindCounts(tx)).toEqual({ LEGAL: 6, INFO: 1, HUB: 6 });

      const bySlug = new Map((await rows(tx)).map((row) => [row.slug, row]));
      const about = bySlug.get('about');
      expect(about?.kind).toBe('INFO');
      // Only the kind moved — what the owner wrote is kept.
      expect(about?.title).toBe(ABOUT_TITLE);
      expect(about?.content).toBe(ABOUT_CONTENT);

      for (const slug of LEGAL_SLUGS) {
        expect(bySlug.get(slug)?.kind).toBe('LEGAL');
      }

      const hubs = [...bySlug.values()].filter((row) => row.kind === 'HUB');
      expect(hubs.map((row) => row.slug).sort()).toEqual([...HUB_SLUGS].sort());
      for (const hub of hubs) {
        // Visible to the storefront's public read, which serves PUBLISHED only.
        expect(hub.status).toBe('PUBLISHED');
        expect(hub.is_active).toBe(true);
        expect(hub.published_at).not.toBeNull();
        // A hub with no metaTitle would put its admin label in the SERP title.
        expect(hub.meta_title).toMatch(/ \| Тест-Стор$/);
        expect(hub.meta_description?.length ?? 0).toBeGreaterThan(20);
        expect(hub.excerpt).toBeTruthy();
      }
      expect(bySlug.get('blog')?.meta_title).toBe('Блог | Тест-Стор');
      expect(bySlug.get('blog')?.content).toContain("прев'ю");
    });
  });

  it('falls back to the storefront name when no site name is set', async () => {
    await inRolledBackTx(async (tx) => {
      await forceSlugUniqueness(tx, 'global');
      await setSiteName(tx, '   ');
      await buildPre176(tx);
      await runMigration(tx);

      const blog = (await rows(tx)).find((row) => row.slug === 'blog');
      expect(blog?.meta_title).toBe('Блог | CaseStore');
    });
  });

  it("never promotes an operator's document that holds a hub slug (slug unique on its own)", async () => {
    await inRolledBackTx(async (tx) => {
      await forceSlugUniqueness(tx, 'global');
      await buildPre176(tx, { operatorPromo: true });
      expect(await kindCounts(tx)).toEqual({ LEGAL: 8, INFO: 0, HUB: 0 });

      await runMigration(tx);

      // Five hubs; `promo` is blocked by the document, which stays exactly as it was.
      expect(await kindCounts(tx)).toEqual({ LEGAL: 7, INFO: 1, HUB: 5 });
      const promo = (await rows(tx)).filter((row) => row.slug === 'promo');
      expect(promo).toHaveLength(1);
      expect(promo[0].kind).toBe('LEGAL');
      expect(promo[0].content).toBe(OPERATOR_PROMO_CONTENT);
    });
  });

  it("inserts the hub BESIDE an operator's document once slugs are unique per kind (TASK-566)", async () => {
    await inRolledBackTx(async (tx) => {
      await forceSlugUniqueness(tx, 'per-kind');
      await buildPre176(tx, { operatorPromo: true });

      await runMigration(tx);

      expect(await kindCounts(tx)).toEqual({ LEGAL: 7, INFO: 1, HUB: 6 });
      const promo = (await rows(tx)).filter((row) => row.slug === 'promo');
      expect(promo.map((row) => row.kind).sort()).toEqual(['HUB', 'LEGAL']);
      expect(promo.find((row) => row.kind === 'LEGAL')?.content).toBe(OPERATOR_PROMO_CONTENT);
    });
  });

  it('is idempotent and never overwrites a hub the owner has edited', async () => {
    await inRolledBackTx(async (tx) => {
      await forceSlugUniqueness(tx, 'global');
      await buildPre176(tx);
      await runMigration(tx);

      await tx.$executeRawUnsafe(
        `UPDATE "pages" SET "meta_title" = 'Власний заголовок блогу' WHERE "slug" = 'blog'`,
      );
      const before = await rows(tx);

      await runMigration(tx);

      const after = await rows(tx);
      expect(after.map(({ slug, kind, meta_title }) => ({ slug, kind, meta_title }))).toEqual(
        before.map(({ slug, kind, meta_title }) => ({ slug, kind, meta_title })),
      );
      expect(after.find((row) => row.slug === 'blog')?.meta_title).toBe('Власний заголовок блогу');
    });
  });

  it('changes nothing on a database seeded after wave 176', async () => {
    await inRolledBackTx(async (tx) => {
      await forceSlugUniqueness(tx, 'global');
      await tx.$executeRawUnsafe('DELETE FROM "pages"');
      let order = 0;
      await insertPage(tx, { slug: 'about', kind: 'INFO' }, order++);
      for (const slug of LEGAL_SLUGS) {
        await insertPage(tx, { slug }, order++);
      }
      for (const slug of HUB_SLUGS) {
        await insertPage(tx, { slug, kind: 'HUB', metaTitle: `owner ${slug}` }, order++);
      }
      const before = await rows(tx);

      await runMigration(tx);

      expect(await rows(tx)).toEqual(before);
    });
  });

  it('inserts nothing into an empty pages table — a database being built from scratch', async () => {
    await inRolledBackTx(async (tx) => {
      await forceSlugUniqueness(tx, 'global');
      await tx.$executeRawUnsafe('DELETE FROM "pages"');

      await runMigration(tx);

      expect(await rows(tx)).toEqual([]);
    });
  });
});
