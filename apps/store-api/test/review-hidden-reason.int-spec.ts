import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { ReviewHiddenReason } from '@prisma/client';
import { PrismaService } from '../src/prisma';
import { ReviewRepository } from '../src/review/review.repository';
import { ReviewService } from '../src/review/review.service';

/**
 * Why a review is hidden, on a REAL Postgres (TASK-599).
 *
 * The defect was a WHERE clause: an un-ban cleared `hiddenAt` on every row of the
 * account, so it also undid what a moderator had decided. A unit test can only
 * say which `where` was sent; this spec says what the rows look like afterwards
 * — including the CHECK constraint that keeps `hidden_at` and `hidden_reason`
 * together, which exists only in the migration and no mock can see.
 *
 * The account's own state (banned / live) is written straight to `users`, as
 * `UserRepository.deactivate/activate` would: what is under test is the review
 * half of those doors, which is `ReviewService.hideAuthor/unhideAuthor` with the
 * reason each door passes (`UserService` passes BAN, the moderation routes pass
 * MODERATOR — pinned by the unit and e2e specs).
 */
describe('Review hidden reason (integration, TASK-599)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: ReviewService;

  const suffix = randomUUID().slice(0, 8);
  let categoryId: string;
  const productIds: string[] = [];
  const userIds: string[] = [];

  const loggerMock = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  /** A live, confirmed author with one published, counting review on each product. */
  async function authorWithReviews(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `hidden-reason-${label}-${suffix}@test.local`,
        passwordHash: 'x',
        emailVerifiedAt: new Date(),
      },
    });
    userIds.push(user.id);
    for (const productId of productIds) {
      await prisma.review.create({
        data: {
          userId: user.id,
          productId,
          rating: 1,
          comment: `${label} text`,
          ratingVisible: true,
          // Approved, so 'not on the storefront' is a real claim, not a queue artefact.
          textStatus: 'APPROVED',
        },
      });
    }
    return user.id;
  }

  const setActive = (userId: string, isActive: boolean) =>
    prisma.user.update({ where: { id: userId }, data: { isActive } });

  const rows = (userId: string) =>
    prisma.review.findMany({
      where: { userId },
      select: { hiddenAt: true, hiddenReason: true, ratingVisible: true },
    });

  /** The door: switch the account off, then hide its contribution as a BAN. */
  async function ban(userId: string) {
    await setActive(userId, false);
    await service.hideAuthor(userId, ReviewHiddenReason.BAN);
  }

  /** The door back: switch the account on, then lift what the BAN put down. */
  async function unban(userId: string) {
    await setActive(userId, true);
    return service.unhideAuthor(userId, ReviewHiddenReason.BAN);
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        ReviewRepository,
        ReviewService,
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(ReviewService);

    const category = await prisma.category.create({
      data: { name: 'Hidden reason', slug: `hidden-reason-${suffix}` },
    });
    categoryId = category.id;
    for (const n of [1, 2]) {
      const product = await prisma.product.create({
        data: {
          name: `Hidden reason ${n}`,
          slug: `hidden-reason-${n}-${suffix}`,
          price: '10.00',
          categoryId,
        },
      });
      productIds.push(product.id);
    }
  });

  afterAll(async () => {
    await prisma.review.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await app.close();
  });

  it('keeps a moderator-hidden review hidden through a ban and an un-ban', async () => {
    const userId = await authorWithReviews('moderated-then-banned');

    await service.hideAuthor(userId, ReviewHiddenReason.MODERATOR);
    await ban(userId);
    const restored = await unban(userId);

    expect(restored).toBe(0);
    for (const row of await rows(userId)) {
      expect(row.hiddenAt).not.toBeNull();
      expect(row.hiddenReason).toBe(ReviewHiddenReason.MODERATOR);
      expect(row.ratingVisible).toBe(false);
    }
    // Not on the storefront, not in the average.
    const page = await service.getApprovedReviews(productIds[0], {});
    expect(page.data.map((r) => r.comment)).not.toContain('moderated-then-banned text');
  });

  it('a moderator hiding an already-banned account outranks the ban', async () => {
    const userId = await authorWithReviews('banned-then-moderated');

    await ban(userId);
    expect((await rows(userId)).every((r) => r.hiddenReason === ReviewHiddenReason.BAN)).toBe(true);
    await service.hideAuthor(userId, ReviewHiddenReason.MODERATOR);
    await unban(userId);

    for (const row of await rows(userId)) {
      expect(row.hiddenReason).toBe(ReviewHiddenReason.MODERATOR);
      expect(row.hiddenAt).not.toBeNull();
    }
  });

  it('an un-ban still gives a plainly banned account everything back', async () => {
    const userId = await authorWithReviews('banned-only');

    await ban(userId);
    const restored = await unban(userId);

    expect(restored).toBe(productIds.length);
    for (const row of await rows(userId)) {
      expect(row).toEqual({ hiddenAt: null, hiddenReason: null, ratingVisible: true });
    }
  });

  it('a moderator restore on a banned account waits for the un-ban', async () => {
    const userId = await authorWithReviews('moderated-banned-forgiven');

    await service.hideAuthor(userId, ReviewHiddenReason.MODERATOR);
    await ban(userId);
    // The moderator changes their mind while the account is still switched off.
    await expect(service.unhideAuthor(userId, ReviewHiddenReason.MODERATOR)).resolves.toBe(0);

    for (const row of await rows(userId)) {
      expect(row.hiddenReason).toBe(ReviewHiddenReason.BAN);
      expect(row.hiddenAt).not.toBeNull();
    }

    await unban(userId);
    for (const row of await rows(userId)) {
      expect(row).toEqual({ hiddenAt: null, hiddenReason: null, ratingVisible: true });
    }
  });

  // TASK-603: soft-deleting an account withdraws its contribution for good.
  it('takes a deleted account off the storefront and out of the average, past every restore', async () => {
    const userId = await authorWithReviews('deleted');
    const before = await service.getApprovedReviews(productIds[0], {});
    expect(before.data.map((r) => r.comment)).toContain('deleted text');
    const countBefore = before.aggregate.ratingCount;

    // A moderator had already hidden it — DELETED must outrank that too.
    await service.hideAuthor(userId, ReviewHiddenReason.MODERATOR);
    // What `UserService.deleteUser` does: tombstone the row, then withdraw.
    await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), isActive: false },
    });
    await service.hideAuthor(userId, ReviewHiddenReason.DELETED);

    const after = await service.getApprovedReviews(productIds[0], {});
    expect(after.data.map((r) => r.comment)).not.toContain('deleted text');
    // Exactly this author's star left the average; nothing else moved.
    expect(after.aggregate.ratingCount).toBe(countBefore - 1);

    // Neither lever brings it back.
    await expect(service.unhideAuthor(userId, ReviewHiddenReason.BAN)).resolves.toBe(0);
    await expect(service.unhideAuthor(userId, ReviewHiddenReason.MODERATOR)).resolves.toBe(0);
    for (const row of await rows(userId)) {
      expect(row.hiddenReason).toBe(ReviewHiddenReason.DELETED);
      expect(row.hiddenAt).not.toBeNull();
      expect(row.ratingVisible).toBe(false);
    }
  });

  it('refuses a row that is hidden without a reason (CHECK constraint)', async () => {
    const userId = await authorWithReviews('check-constraint');

    await expect(
      prisma.review.updateMany({ where: { userId }, data: { hiddenAt: new Date() } }),
    ).rejects.toThrow(/reviews_hidden_reason_matches_hidden_at/);
  });
});
