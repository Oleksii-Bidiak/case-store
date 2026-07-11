import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { PublishStatus } from '@prisma/client';
import { SeoSettingsRepository } from '../src/seo-settings/seo-settings.repository';
import { PrismaService } from '../src/prisma';

/**
 * Integration test for `SeoSettingsRepository.getContentSeoCounts`'s raw
 * thin-content SQL (TASK-285-J) — runs the REAL repository against a REAL
 * Postgres instance. The `length(regexp_replace(content, …))` query is exactly
 * the class of raw SQL only a live DB can prove (wrong physical table/column
 * names — the TASK-238 `findDescendantIds` failure mode — pass every mocked
 * unit spec silently).
 *
 * Fixture pages (namespaced slugs, cleaned up after):
 *   - published, NO metaDescription, SHORT stripped content  → counted by both
 *   - published, metaDescription set, LONG content (> 300)   → counted by neither
 *   - DRAFT, no metaDescription, short content               → excluded (not published)
 *
 * Counts are asserted as DELTAS against a pre-seed baseline so leftover rows in
 * a shared test DB never break the assertions.
 *
 * Requires an isolated `*_test` database; DATABASE_URL is forced to it by
 * setup-int.ts. Run with `npm run test:int -w apps/store-api`.
 */
describe('SeoSettingsRepository.getContentSeoCounts (integration, TASK-285-J)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: SeoSettingsRepository;

  const ns = `seo-int-${randomUUID().slice(0, 8)}`;
  const slug = (s: string) => `${ns}-${s}`;

  let baseline: {
    pagesTotal: number;
    pagesMissingMetaDescription: number;
    pagesThinContent: number;
  };

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, SeoSettingsRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(SeoSettingsRepository);

    baseline = await repo.getContentSeoCounts();

    const longText = 'Довгий змістовний текст сторінки. '.repeat(20); // ≫ 300 chars stripped
    await prisma.page.createMany({
      data: [
        {
          slug: slug('thin-no-desc'),
          title: 'Thin page',
          // < 300 chars once tags are stripped; tags themselves must not count.
          content: '<p>Короткий текст.</p>',
          metaDescription: null,
          status: PublishStatus.PUBLISHED,
          publishedAt: new Date(),
          isActive: true,
        },
        {
          slug: slug('rich-with-desc'),
          title: 'Rich page',
          content: `<p>${longText}</p>`,
          metaDescription: 'Повний SEO-опис сторінки.',
          status: PublishStatus.PUBLISHED,
          publishedAt: new Date(),
          isActive: true,
        },
        {
          slug: slug('draft-thin'),
          title: 'Draft page',
          content: '<p>Чернетка.</p>',
          metaDescription: null,
          status: PublishStatus.DRAFT,
          isActive: false,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.page.deleteMany({ where: { slug: { startsWith: `${ns}-` } } });
    await app.close();
  });

  it('counts the description/thin-content gaps against real Postgres', async () => {
    const counts = await repo.getContentSeoCounts();

    // Two published fixtures joined the totals; the draft is invisible.
    expect(counts.pagesTotal - baseline.pagesTotal).toBe(2);
    // Only the published no-description page moves the description counter.
    expect(counts.pagesMissingMetaDescription - baseline.pagesMissingMetaDescription).toBe(1);
    // Only the published short page moves the thin-content counter — the raw
    // regexp_replace/length SQL runs for real here (table + column names proven).
    expect(counts.pagesThinContent - baseline.pagesThinContent).toBe(1);
  });
});
