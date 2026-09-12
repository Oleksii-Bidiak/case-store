import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Banner, BannerPlacement, Prisma, PublishStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PublishingScheduler, RevalidationNotifier } from '../src/publishing';
import { HttpExceptionFilter } from '../src/common/filters';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the banner PUBLICATION WINDOW (TASK-429):
 *
 *   POST/PUT /api/admin/banners      — `scheduledUntil` on the wire + its DTO rule
 *   PublishingScheduler.tick()       — the worker that closes the window
 *   GET  /api/banners                — what the shopper sees before and after
 *
 * UNLIKE the other content e2e suites this one does NOT mock the repository: the
 * real {@link BannerRepository} runs against an in-memory `banner` delegate
 * (a plain array plus the two `where` shapes the repository actually issues). That
 * is deliberate — the acceptance claim is "a banner with a closed window is
 * unpublished BY THE WORKER", and a mocked repository would only prove that the
 * scheduler calls a method, not that a live banner stops being served. Here the
 * public feed is read through the real read path before and after one real tick.
 *
 * NO FAKE TIMERS AND NO WAITING. The window end is a fixed date in 2020, so it is
 * already closed on the first tick; `tick()` is public precisely so the behaviour
 * is exercised directly instead of by sitting on a cron interval (see setup-e2e:
 * e2e runs with SCHEDULER_ENABLED=false, so no cron is registered at all).
 */

// Pass-through guard that allows all requests (disables rate limiting in tests)
class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

/** A complete banner row — every column the entity mapper reads. */
function bannerRow(overrides: Partial<Banner> & Pick<Banner, 'id' | 'title'>): Banner {
  return {
    placement: BannerPlacement.PROMO_BANNER,
    subtitle: null,
    imageUrl: null,
    imageBlurDataUrl: null,
    ctaLabel: null,
    ctaHref: null,
    theme: null,
    sortOrder: 0,
    status: PublishStatus.PUBLISHED,
    publishedAt: new Date('2026-07-01T00:00:00.000Z'),
    scheduledAt: null,
    scheduledUntil: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  } as Banner;
}

describe('Banner publication window (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let scheduler: PublishingScheduler;

  const liveId = '550e8400-e29b-41d4-a716-446655440001';
  const windowedId = '550e8400-e29b-41d4-a716-446655440002';

  /** The in-memory `banners` table, re-seeded before every test. */
  let table: Banner[] = [];

  /** Does a row satisfy the (small) subset of `where` this suite exercises? */
  function matches(row: Banner, where: Prisma.BannerWhereInput = {}): boolean {
    if (where.status !== undefined && row.status !== where.status) return false;
    if (where.placement !== undefined && row.placement !== where.placement) return false;
    for (const field of ['scheduledAt', 'scheduledUntil'] as const) {
      const filter = where[field] as { lte?: Date } | undefined;
      if (filter?.lte === undefined) continue;
      // A NULL instant can never satisfy `<=` — "no end" means "stays up".
      if (row[field] === null) return false;
      if ((row[field] as Date).getTime() > filter.lte.getTime()) return false;
    }
    return true;
  }

  const bannerDelegate = {
    findMany: ({ where }: { where?: Prisma.BannerWhereInput } = {}) =>
      Promise.resolve(table.filter((row) => matches(row, where))),
    findUnique: ({ where }: { where: { id: string } }) =>
      Promise.resolve(table.find((row) => row.id === where.id) ?? null),
    count: ({ where }: { where?: Prisma.BannerWhereInput } = {}) =>
      Promise.resolve(table.filter((row) => matches(row, where)).length),
    aggregate: () => Promise.resolve({ _max: { sortOrder: null } }),
    create: ({ data }: { data: Banner }) => {
      const created = bannerRow({ ...data, id: data.id ?? `created-${table.length + 1}` });
      table.push(created);
      return Promise.resolve(created);
    },
    update: ({ where, data }: { where: { id: string }; data: Partial<Banner> }) => {
      const row = table.find((candidate) => candidate.id === where.id);
      if (!row) return Promise.reject(new Error(`no banner ${where.id}`));
      Object.assign(row, data);
      return Promise.resolve(row);
    },
    updateMany: ({ where, data }: { where?: Prisma.BannerWhereInput; data: Partial<Banner> }) => {
      const hits = table.filter((row) => matches(row, where));
      hits.forEach((row) => Object.assign(row, data));
      return Promise.resolve({ count: hits.length });
    },
    delete: ({ where }: { where: { id: string } }) => {
      table = table.filter((row) => row.id !== where.id);
      return Promise.resolve({ id: where.id } as Banner);
    },
  };

  // The scheduler ticks EVERY discovered publisher, and pages/blog/carousels are
  // real repositories here too — give each a no-op delegate so their half of the
  // tick is a quiet zero instead of a swallowed "cannot read properties of
  // undefined" that would hide a genuine banner failure in the same log line.
  const quietPublisher = { updateMany: () => Promise.resolve({ count: 0 }) };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn({ ...prismaServiceMock, $executeRaw: () => Promise.resolve(0) })),
    banner: bannerDelegate,
    page: quietPublisher,
    blogPost: quietPublisher,
    carousel: quietPublisher,
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const revalidationMock = { revalidate: jest.fn() };

  function adminToken(): string {
    return jwtService.sign(
      { sub: 'admin-e2e-1', email: 'admin-e2e-1@example.com', role: 'ADMIN' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
        AppModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(PermissionRepository)
      .useValue(createPermissionRepositoryMock())
      .overrideProvider(RevalidationNotifier)
      .useValue(revalidationMock)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);
    scheduler = moduleFixture.get<PublishingScheduler>(PublishingScheduler);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(moduleFixture.get(HttpExceptionFilter));
    app.setGlobalPrefix('api', { exclude: ['health'] });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    revalidationMock.revalidate.mockReset();
    revalidationMock.revalidate.mockResolvedValue(undefined);
    table = [
      bannerRow({ id: liveId, title: 'Постійний банер' }),
      bannerRow({
        id: windowedId,
        title: 'Акція до 1-го',
        // Already closed — no timers, no waiting, no dependence on the wall clock
        // beyond "today is after 2020".
        scheduledUntil: new Date('2020-01-01T00:00:00.000Z'),
      }),
    ];
  });

  // ─── the worker closes the window ───────────────────────────────────────────

  describe('PublishingScheduler.tick() — the window closes itself', () => {
    it('unpublishes a banner whose window has closed and leaves the others live', async () => {
      const before = await request(app.getHttpServer()).get('/api/banners').expect(200);
      expect(before.body.data.map((b: { id: string }) => b.id)).toEqual([liveId, windowedId]);

      await scheduler.tick();

      const after = await request(app.getHttpServer()).get('/api/banners').expect(200);
      // The shopper no longer sees it — which is the whole feature, and it happened
      // with nobody logged in at 3 a.m.
      expect(after.body.data.map((b: { id: string }) => b.id)).toEqual([liveId]);

      const expired = table.find((row) => row.id === windowedId)!;
      expect(expired.status).toBe(PublishStatus.DRAFT);
      expect(expired.publishedAt).toBeNull();
      // Cleared, so re-publishing by hand is not undone on the next tick.
      expect(expired.scheduledUntil).toBeNull();
    });

    it('purges the storefront cache for a tick that only expired a banner', async () => {
      await scheduler.tick();

      expect(revalidationMock.revalidate).toHaveBeenCalledWith({
        tags: ['banners'],
        paths: ['/'],
      });
    });

    it('is idempotent — a second tick changes nothing and asks for no revalidation', async () => {
      await scheduler.tick();
      revalidationMock.revalidate.mockClear();

      await scheduler.tick();

      expect(table.find((row) => row.id === liveId)!.status).toBe(PublishStatus.PUBLISHED);
      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });

    it('publishes a due SCHEDULED banner and expires a closed one in the SAME tick', async () => {
      table.push(
        bannerRow({
          id: '550e8400-e29b-41d4-a716-446655440003',
          title: 'Час настав',
          status: PublishStatus.SCHEDULED,
          publishedAt: null,
          scheduledAt: new Date('2020-06-01T00:00:00.000Z'),
        }),
      );

      await scheduler.tick();

      const statuses = Object.fromEntries(table.map((row) => [row.title, row.status]));
      expect(statuses['Час настав']).toBe(PublishStatus.PUBLISHED);
      expect(statuses['Акція до 1-го']).toBe(PublishStatus.DRAFT);
    });
  });

  // ─── the DTO rule ───────────────────────────────────────────────────────────

  describe('POST /api/admin/banners — window validation', () => {
    const base = {
      placement: BannerPlacement.HERO_SLIDE,
      title: 'Вікно публікації',
      status: PublishStatus.SCHEDULED,
    };

    it('rejects an END BEFORE the START with 400 and writes nothing', async () => {
      const rows = table.length;

      const response = await request(app.getHttpServer())
        .post('/api/admin/banners')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...base,
          scheduledAt: '2026-08-10T09:00:00.000Z',
          scheduledUntil: '2026-08-01T09:00:00.000Z',
        })
        .expect(400);

      expect(JSON.stringify(response.body)).toContain('scheduledUntil');
      expect(table).toHaveLength(rows);
    });

    it('rejects an end EQUAL to the start — a zero-length window is not a window', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/banners')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...base,
          scheduledAt: '2026-08-10T09:00:00.000Z',
          scheduledUntil: '2026-08-10T09:00:00.000Z',
        })
        .expect(400);
    });

    it('rejects a non-ISO end with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/banners')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...base, scheduledAt: '2026-08-01T09:00:00.000Z', scheduledUntil: '1 вересня' })
        .expect(400);
    });

    it('accepts a valid from-to window and echoes both instants back', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/admin/banners')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...base,
          scheduledAt: '2099-08-01T09:00:00.000Z',
          scheduledUntil: '2099-09-01T09:00:00.000Z',
        })
        .expect(201);

      expect(response.body.data).toMatchObject({
        status: PublishStatus.SCHEDULED,
        scheduledAt: '2099-08-01T09:00:00.000Z',
        scheduledUntil: '2099-09-01T09:00:00.000Z',
      });
    });

    it('accepts an end with NO start — "live now, down on the 1st"', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/admin/banners')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          placement: BannerPlacement.PROMO_BANNER,
          title: 'Зняти 1-го',
          status: PublishStatus.PUBLISHED,
          scheduledUntil: '2099-09-01T00:00:00.000Z',
        })
        .expect(201);

      expect(response.body.data).toMatchObject({
        status: PublishStatus.PUBLISHED,
        scheduledUntil: '2099-09-01T00:00:00.000Z',
      });
    });
  });

  describe('PUT /api/admin/banners/:id — window validation', () => {
    it('rejects an inverted window on update too (the rule is not create-only)', async () => {
      await request(app.getHttpServer())
        .put(`/api/admin/banners/${liveId}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          status: PublishStatus.SCHEDULED,
          scheduledAt: '2099-08-10T09:00:00.000Z',
          scheduledUntil: '2099-08-01T09:00:00.000Z',
        })
        .expect(400);

      expect(table.find((row) => row.id === liveId)!.status).toBe(PublishStatus.PUBLISHED);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .put(`/api/admin/banners/${liveId}`)
        .send({ status: PublishStatus.PUBLISHED, scheduledUntil: '2099-09-01T00:00:00.000Z' })
        .expect(401);
    });

    it('stores a window end on an already-live banner', async () => {
      await request(app.getHttpServer())
        .put(`/api/admin/banners/${liveId}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: PublishStatus.PUBLISHED, scheduledUntil: '2099-09-01T00:00:00.000Z' })
        .expect(200);

      expect(table.find((row) => row.id === liveId)!.scheduledUntil).toEqual(
        new Date('2099-09-01T00:00:00.000Z'),
      );
    });
  });
});
