import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { ReviewRepository, ReviewsNotFoundError } from '../src/review/review.repository';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the Review module.
 *
 * Review endpoints sit behind JwtAuthGuard (submit) / PermissionGuard (moderation),
 * so each protected request mints a JWT directly via JwtService (bypassing the
 * rate-limited auth endpoints). ReviewRepository — the clean-architecture
 * boundary — is mocked, so no real database is needed. AuthRepository,
 * UserRepository, and PrismaService are also mocked to let AppModule bootstrap.
 * ThrottlerGuard is overridden with a pass-through guard to disable rate
 * limiting.
 *
 * NOTE: this spec is intended to run in the integration phase against the shared
 * test harness; it is written here but executed there.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('ReviewController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const reviewRepositoryMock = {
    create: jest.fn(),
    findApprovedByProduct: jest.fn(),
    aggregate: jest.fn(),
    findForModeration: jest.fn(),
    findById: jest.fn(),
    findOwnByProduct: jest.fn(),
    findOwnById: jest.fn(),
    updateComment: jest.fn(),
    upsertReply: jest.fn(),
    approve: jest.fn(),
    rejectText: jest.fn(),
    moderateMany: jest.fn(),
    isVerifiedPurchase: jest.fn(),
    findVerifiedPurchaserIds: jest.fn(),
    findExisting: jest.fn(),
    // TASK-588: the email gate, asked at submission and again on restore.
    isEmailVerified: jest.fn(),
    // TASK-598: hiding an account has to stop it writing NEW ratings too, not
    // merely withdraw the ones it already wrote.
    isAuthorHidden: jest.fn().mockResolvedValue(false),
    // TASK-589: the one-click account-wide lever.
    hideAuthorReviews: jest.fn(),
    restoreAuthorReviews: jest.fn(),
  };

  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
  };

  const userRepositoryMock = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  // ─── Test data ──────────────────────────────────────────────────────────────

  const customer = { id: 'customer-e2e-1', role: 'CUSTOMER' as const };
  const admin = { id: 'admin-e2e-1', role: 'ADMIN' as const };
  const manager = { id: 'manager-e2e-1', role: 'MANAGER' as const };
  const PRODUCT_ID = 'product-e2e-1';
  const now = new Date('2026-06-30T00:00:00.000Z');

  // The matrix for this suite: a manager who may MODERATE review texts and — for
  // now — nothing else. `reviews:write` is a separate tick (TASK-587), and the
  // reply route below must prove it is really separate.
  const permissionRepositoryMock = createPermissionRepositoryMock({
    grants: { MANAGER: ['reviews:moderate'] },
  });

  const makeReview = (overrides: Record<string, unknown> = {}) => ({
    id: 'review-e2e-1',
    userId: customer.id,
    productId: PRODUCT_ID,
    rating: 5,
    comment: 'Great case!',
    ratingVisible: false,
    textStatus: 'PENDING',
    hiddenAt: null,
    createdIp: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  const makeReply = (overrides: Record<string, unknown> = {}) => ({
    id: 'reply-e2e-1',
    reviewId: 'review-e2e-1',
    authorUserId: admin.id,
    body: 'Дякуємо за відгук!',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  function generateAccessToken(userId: string, role: string): string {
    return jwtService.sign(
      { sub: userId, role },
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
      .useValue(permissionRepositoryMock)
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(ReviewRepository)
      .useValue(reviewRepositoryMock)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    app.setGlobalPrefix('api', { exclude: ['health'] });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ─── POST /api/products/:productId/reviews ────────────────────────────────────

  describe('POST /api/products/:productId/reviews', () => {
    it('should return 401 without a JWT', async () => {
      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/reviews`)
        .send({ rating: 5, comment: 'Nice' })
        .expect(401);
    });

    it('should create a review and return 201 with valid auth + body', async () => {
      const token = generateAccessToken(customer.id, customer.role);
      reviewRepositoryMock.findExisting.mockResolvedValue(null);
      reviewRepositoryMock.isVerifiedPurchase.mockResolvedValue(true);
      reviewRepositoryMock.create.mockResolvedValue(makeReview());

      const response = await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5, comment: 'Great case!' })
        .expect(201);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.rating).toBe(5);
      expect(response.body.data.verifiedPurchase).toBe(true);
      // TASK-585: moderation state is no longer part of the public contract — not
      // under its old name, and not under its new ones either.
      expect(response.body.data).not.toHaveProperty('isActive');
      expect(response.body.data).not.toHaveProperty('textStatus');
      expect(response.body.data).not.toHaveProperty('ratingVisible');
    });

    it('stores a comment of spaces as no comment at all', async () => {
      // TASK-598. `'   '` is not null and not the empty string, so it cleared both
      // arms of the public filter and rendered on the PDP as an author, a date and
      // an empty speech bubble — the one thing that filter exists to prevent. It is
      // also invisible in the moderation queue, where the operator sees a blank
      // cell and has no reason not to approve it. Trimmed at the boundary, it
      // becomes `''`, which every predicate downstream already excludes.
      const token = generateAccessToken(customer.id, customer.role);
      reviewRepositoryMock.findExisting.mockResolvedValue(null);
      reviewRepositoryMock.isVerifiedPurchase.mockResolvedValue(false);
      reviewRepositoryMock.create.mockResolvedValue(makeReview({ comment: '' }));

      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5, comment: '   ' })
        .expect(201);

      expect(reviewRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ comment: '' }),
      );
    });

    it('should return 400 for a rating out of range', async () => {
      const token = generateAccessToken(customer.id, customer.role);

      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 9 })
        .expect(400);

      expect(reviewRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('should return 409 when the user already reviewed the product', async () => {
      const token = generateAccessToken(customer.id, customer.role);
      reviewRepositoryMock.findExisting.mockResolvedValue(makeReview());

      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 4 })
        .expect(409);
    });

    it('should return 409 when the repository raises a P2002 unique violation race', async () => {
      const token = generateAccessToken(customer.id, customer.role);
      reviewRepositoryMock.findExisting.mockResolvedValue(null);
      reviewRepositoryMock.isVerifiedPurchase.mockResolvedValue(false);
      reviewRepositoryMock.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.0.0',
        }),
      );

      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 4 })
        .expect(409);
    });
  });

  // ─── GET /api/products/:productId/reviews ─────────────────────────────────────

  describe('GET /api/products/:productId/reviews', () => {
    it('should return 200 (public) with { data, aggregate, meta }', async () => {
      reviewRepositoryMock.findApprovedByProduct.mockResolvedValue({
        reviews: [makeReview({ textStatus: 'APPROVED', ratingVisible: true })],
        total: 1,
      });
      reviewRepositoryMock.aggregate.mockResolvedValue({ ratingAverage: 5, ratingCount: 1 });
      reviewRepositoryMock.findVerifiedPurchaserIds.mockResolvedValue(new Set<string>());

      const response = await request(app.getHttpServer())
        .get(`/api/products/${PRODUCT_ID}/reviews`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('aggregate');
      expect(response.body).toHaveProperty('meta');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.aggregate).toHaveProperty('ratingAverage');
      expect(response.body.aggregate).toHaveProperty('ratingCount');
      expect(response.body.meta).toHaveProperty('totalPages');
      expect(response.body.data[0]).not.toHaveProperty('isActive');
    });

    // TASK-585: ratings and texts are counted by different queries now, and the
    // owner accepted that the two numbers differ. This pins that the wire carries
    // them separately instead of some reconciled single figure — a client that
    // read «8 оцінок» off `meta.total` would silently under-report every product.
    it('reports the rating count and the text count as separate numbers', async () => {
      reviewRepositoryMock.findApprovedByProduct.mockResolvedValue({
        reviews: [makeReview({ textStatus: 'APPROVED', ratingVisible: true })],
        total: 1,
      });
      reviewRepositoryMock.aggregate.mockResolvedValue({ ratingAverage: 4.4, ratingCount: 9 });
      reviewRepositoryMock.findVerifiedPurchaserIds.mockResolvedValue(new Set<string>());

      const response = await request(app.getHttpServer())
        .get(`/api/products/${PRODUCT_ID}/reviews`)
        .expect(200);

      expect(response.body.aggregate.ratingCount).toBe(9);
      expect(response.body.meta.total).toBe(1);
    });

    // TASK-587: the shop's answer rides with the review it answers, and carries
    // no identity. The storefront renders «Магазин», never a person — that is the
    // owner's decision of 2026-09-14, and the wire format is what enforces it.
    it('carries the shop reply — its text and date, and nobody’s name', async () => {
      reviewRepositoryMock.findApprovedByProduct.mockResolvedValue({
        reviews: [
          {
            ...makeReview({ textStatus: 'APPROVED', ratingVisible: true }),
            reply: makeReply(),
          },
        ],
        total: 1,
      });
      reviewRepositoryMock.aggregate.mockResolvedValue({ ratingAverage: 5, ratingCount: 1 });
      reviewRepositoryMock.findVerifiedPurchaserIds.mockResolvedValue(new Set<string>());

      const response = await request(app.getHttpServer())
        .get(`/api/products/${PRODUCT_ID}/reviews`)
        .expect(200);

      expect(response.body.data[0].reply.body).toBe('Дякуємо за відгук!');
      expect(response.body.data[0].reply).not.toHaveProperty('authorUserId');
      expect(JSON.stringify(response.body)).not.toContain(admin.id);
    });
  });

  // ─── GET /api/products/:productId/reviews/mine (TASK-586) ────────────────────
  //
  // Owner's decision 5 (2026-09-10): an author may come back and add text to a
  // rating they already left. The storefront cannot offer that without being told
  // a rating exists — and it cannot learn that from the public list, where a
  // star-only row deliberately never appears.

  describe('GET /api/products/:productId/reviews/mine', () => {
    const url = `/api/products/${PRODUCT_ID}/reviews/mine`;

    it('returns 401 without a JWT — there is no "mine" for an anonymous caller', async () => {
      await request(app.getHttpServer()).get(url).expect(401);
    });

    it('answers { data: null } when the caller has not reviewed this product', async () => {
      const token = generateAccessToken(customer.id, customer.role);
      reviewRepositoryMock.findOwnByProduct.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({ data: null });
    });

    it("carries the author's own text verdict, but no moderator bookkeeping", async () => {
      const token = generateAccessToken(customer.id, customer.role);
      reviewRepositoryMock.findOwnByProduct.mockResolvedValue(
        makeReview({ comment: null, textStatus: 'REJECTED', createdIp: '203.0.113.7' }),
      );

      const response = await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(reviewRepositoryMock.findOwnByProduct).toHaveBeenCalledWith(customer.id, PRODUCT_ID);
      expect(response.body.data.rating).toBe(5);
      expect(response.body.data.textStatus).toBe('REJECTED');
      // The author is entitled to their own verdict. They are not entitled to
      // `hiddenAt` — a moderator's account-wide lever they must not be able to
      // probe — nor to `createdIp`, kept for abuse signals and shown to nobody.
      expect(response.body.data).not.toHaveProperty('hiddenAt');
      expect(response.body.data).not.toHaveProperty('createdIp');
    });
  });

  // ─── PATCH /api/reviews/:id (TASK-586) ───────────────────────────────────────

  describe('PATCH /api/reviews/:id', () => {
    const url = '/api/reviews/review-e2e-1';

    it('returns 401 without a JWT', async () => {
      await request(app.getHttpServer()).patch(url).send({ comment: 'hello' }).expect(401);
    });

    it('adds the text to an existing rating and sends it back to moderation', async () => {
      const token = generateAccessToken(customer.id, customer.role);
      reviewRepositoryMock.findOwnById.mockResolvedValue(makeReview({ comment: null }));
      reviewRepositoryMock.updateComment.mockResolvedValue(
        makeReview({ comment: 'Added a week later', textStatus: 'PENDING' }),
      );

      const response = await request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ comment: 'Added a week later' })
        .expect(200);

      expect(reviewRepositoryMock.findOwnById).toHaveBeenCalledWith('review-e2e-1', customer.id);
      expect(reviewRepositoryMock.updateComment).toHaveBeenCalledWith(
        'review-e2e-1',
        'Added a week later',
      );
      expect(response.body.data.comment).toBe('Added a week later');
      expect(response.body.data.textStatus).toBe('PENDING');
    });

    it('refuses an attempt to change the rating instead of ignoring it', async () => {
      // Silently dropping an unknown field is the dangerous half of this: the
      // caller gets a 200 and believes their one star landed. The global pipe's
      // `forbidNonWhitelisted` is what makes the refusal explicit, and `rating`
      // being absent from the DTO is what makes it immutable.
      const token = generateAccessToken(customer.id, customer.role);
      reviewRepositoryMock.findOwnById.mockResolvedValue(makeReview());

      await request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 1 })
        .expect(400);

      expect(reviewRepositoryMock.updateComment).not.toHaveBeenCalled();
    });

    it('404s for a non-author, so the endpoint is not an id oracle', async () => {
      // 403 would confirm the row exists. Walk the id space, keep whatever answers
      // 403, and you have a map of real review ids without being allowed to read
      // one of them.
      const token = generateAccessToken(customer.id, customer.role);
      reviewRepositoryMock.findOwnById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ comment: 'not mine' })
        .expect(404);

      expect(reviewRepositoryMock.updateComment).not.toHaveBeenCalled();
    });

    it('rejects a comment past the 1000-character cap', async () => {
      const token = generateAccessToken(customer.id, customer.role);

      await request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ comment: 'x'.repeat(1001) })
        .expect(400);

      expect(reviewRepositoryMock.updateComment).not.toHaveBeenCalled();
    });

    it('leaves the row untouched for an empty body — no write at all', async () => {
      const token = generateAccessToken(customer.id, customer.role);
      reviewRepositoryMock.findOwnById.mockResolvedValue(
        makeReview({ comment: 'Already said my piece', textStatus: 'APPROVED' }),
      );

      const response = await request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(200);

      expect(reviewRepositoryMock.updateComment).not.toHaveBeenCalled();
      // And the published verdict survives: omitting the field is not an edit.
      expect(response.body.data.textStatus).toBe('APPROVED');
    });

    // TASK-598 — three bodies that used to erase a text and re-queue the row.
    // `@IsOptional()` waves `null` through, and the service short-circuits only on
    // `undefined`, so `{"comment": null}` wiped the comment AND sent it back to
    // PENDING: an entry in the moderation queue with nothing in it, which only a
    // verdict on a review nobody wrote could clear. There is no erase in this
    // contract, so all three are refused.
    it.each([
      ['an explicit null', null],
      ['an empty string', ''],
      ['a string of spaces', '   '],
    ])('refuses %s instead of erasing the text and re-queueing the row', async (_label, value) => {
      const token = generateAccessToken(customer.id, customer.role);
      reviewRepositoryMock.findOwnById.mockResolvedValue(
        makeReview({ comment: 'Already said my piece', textStatus: 'APPROVED' }),
      );

      await request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ comment: value })
        .expect(400);

      expect(reviewRepositoryMock.updateComment).not.toHaveBeenCalled();
    });
  });

  // ─── GET /api/admin/reviews ───────────────────────────────────────────────────

  describe('GET /api/admin/reviews', () => {
    it('should return 401 without a JWT', async () => {
      await request(app.getHttpServer()).get('/api/admin/reviews').expect(401);
    });

    it('should return 403 for a CUSTOMER', async () => {
      const token = generateAccessToken(customer.id, customer.role);
      await request(app.getHttpServer())
        .get('/api/admin/reviews')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 200 with a paginated list for an ADMIN', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      reviewRepositoryMock.findForModeration.mockResolvedValue({
        reviews: [
          {
            ...makeReview(),
            user: { email: 'olena@example.com' },
            product: { name: 'iPhone 15 Pro Case' },
          },
        ],
        total: 1,
      });

      const response = await request(app.getHttpServer())
        .get('/api/admin/reviews')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.data[0]).toHaveProperty('userEmail', 'olena@example.com');
      expect(response.body.data[0]).toHaveProperty('productName', 'iPhone 15 Pro Case');
    });
  });

  // ─── PATCH /api/admin/reviews/:id/approve ─────────────────────────────────────

  // ─── PATCH /api/admin/reviews/moderate (bulk, TASK-356) ─────────────────────

  describe('PATCH /api/admin/reviews/moderate', () => {
    const url = '/api/admin/reviews/moderate';
    const ids = ['11111111-1111-4111-8111-111111111111'];

    it('is not swallowed by the :id routes — moderate reaches the bulk handler', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      reviewRepositoryMock.moderateMany.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .patch(url)
        .set('Authorization', 'Bearer ' + token)
        .send({ ids, action: 'approve' })
        .expect(200);

      expect(response.body.data.updatedCount).toBe(1);
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).patch(url).send({ ids, action: 'approve' }).expect(401);
    });

    it('returns 403 for a customer', async () => {
      const token = generateAccessToken(customer.id, customer.role);
      await request(app.getHttpServer())
        .patch(url)
        .set('Authorization', 'Bearer ' + token)
        .send({ ids, action: 'approve' })
        .expect(403);
    });

    it('rejects an empty selection', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      await request(app.getHttpServer())
        .patch(url)
        .set('Authorization', 'Bearer ' + token)
        .send({ ids: [], action: 'approve' })
        .expect(400);
      expect(reviewRepositoryMock.moderateMany).not.toHaveBeenCalled();
    });

    it('rejects a repeated id instead of 404ing on a review that exists', async () => {
      // Prisma's `id: { in: }` collapses duplicates, so the repository's
      // found-vs-asked count check would read `[X, X]` as one missing id and
      // abort with a 404 naming nothing. On a deleting endpoint that leaves the
      // operator unable to tell whether anything was removed.
      const token = generateAccessToken(admin.id, admin.role);
      await request(app.getHttpServer())
        .patch(url)
        .set('Authorization', 'Bearer ' + token)
        .send({ ids: [ids[0], ids[0]], action: 'approve' })
        .expect(400);
      expect(reviewRepositoryMock.moderateMany).not.toHaveBeenCalled();
    });

    it('rejects an unknown action rather than guessing what was meant', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      await request(app.getHttpServer())
        .patch(url)
        .set('Authorization', 'Bearer ' + token)
        .send({ ids, action: 'delete' })
        .expect(400);
      expect(reviewRepositoryMock.moderateMany).not.toHaveBeenCalled();
    });

    it('404s on an unknown id — the batch is all-or-nothing, and reject deletes', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      reviewRepositoryMock.moderateMany.mockRejectedValue(new ReviewsNotFoundError(['gone']));

      await request(app.getHttpServer())
        .patch(url)
        .set('Authorization', 'Bearer ' + token)
        .send({ ids, action: 'reject' })
        .expect(404);
    });
  });

  describe('PATCH /api/admin/reviews/:id/approve', () => {
    it('should return 200 for an ADMIN', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      reviewRepositoryMock.findById.mockResolvedValue(makeReview());
      reviewRepositoryMock.approve.mockResolvedValue(makeReview({ textStatus: 'APPROVED' }));

      const response = await request(app.getHttpServer())
        .patch('/api/admin/reviews/review-e2e-1/approve')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.id).toBe('review-e2e-1');
      expect(reviewRepositoryMock.approve).toHaveBeenCalledWith('review-e2e-1');
    });

    it('should return 404 for an unknown id', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      reviewRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/admin/reviews/missing/approve')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ─── PATCH /api/admin/reviews/:id/reject (TASK-585) ──────────────────────────
  //
  // Was `DELETE /api/admin/reviews/:id`. A verb change, because the operation is
  // no longer a deletion: the row stays, the rating stays counting, and only the
  // text's verdict moves. A DELETE that left the row behind would be the wrong
  // word for what happens.

  describe('PATCH /api/admin/reviews/:id/reject', () => {
    it('rejects the TEXT and leaves the rating intact', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      const existing = makeReview({ rating: 5, ratingVisible: true });
      reviewRepositoryMock.findById.mockResolvedValue(existing);
      reviewRepositoryMock.rejectText.mockResolvedValue(
        makeReview({ rating: 5, ratingVisible: true, textStatus: 'REJECTED' }),
      );

      const response = await request(app.getHttpServer())
        .patch('/api/admin/reviews/review-e2e-1/reject')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(reviewRepositoryMock.rejectText).toHaveBeenCalledWith('review-e2e-1');
      expect(response.body.data.rating).toBe(5);
      expect(response.body.data.id).toBe('review-e2e-1');
    });

    it('should return 404 for an unknown id', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      reviewRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/admin/reviews/missing/reject')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('returns 403 for a customer', async () => {
      const token = generateAccessToken(customer.id, customer.role);

      await request(app.getHttpServer())
        .patch('/api/admin/reviews/review-e2e-1/reject')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    // The old destructive route must be GONE, not merely unused. Leaving it
    // mounted would mean the admin panel's stale generated hook still hard-deletes
    // reviews — the exact behaviour this task exists to remove — and would do it
    // silently, because a 204 looks like success.
    it('no longer answers the DELETE that used to hard-delete the row', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      // A findable review on purpose: with the old route still mounted this
      // returns 204 and the row is gone, so a 404 here proves the ROUTE is
      // absent rather than merely that the id was not found.
      reviewRepositoryMock.findById.mockResolvedValue(makeReview());

      await request(app.getHttpServer())
        .delete('/api/admin/reviews/review-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ─── POST /api/admin/reviews/:id/reply (TASK-587) ────────────────────────────
  //
  // Owner's decision, 2026-09-14: only the SHOP answers, anyone holding
  // `reviews:write` writes on its behalf, there is no author thread, and the
  // customer byline stays «Покупець».
  //
  // Declared LAST in the suite on purpose: the permission test below replaces the
  // manager's resolved actor with a wider grant set via `jest.spyOn`, and the
  // suite's `afterEach` calls `resetAllMocks` (which strips implementations)
  // rather than `restoreAllMocks` (which would put the original back). Anything
  // declared after it would see a `findActor` that resolves to undefined.

  /**
   * One click that withdraws — or restores — an account's WHOLE contribution
   * (TASK-589, the owner's 2026-09-10 decision).
   *
   * Per-row moderation is the wrong tool against a person rather than a sentence:
   * an abuser with thirty ratings costs thirty clicks, and the ratings are not
   * even in the queue, so nothing on the moderation screen shows them at all.
   */
  describe('POST /api/admin/reviews/authors/:userId/hide', () => {
    const url = '/api/admin/reviews/authors/abuser-1/hide';

    it('returns 401 without a JWT', async () => {
      await request(app.getHttpServer()).post(url).expect(401);
    });

    it('returns 403 for a customer', async () => {
      const token = generateAccessToken(customer.id, customer.role);

      await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(reviewRepositoryMock.hideAuthorReviews).not.toHaveBeenCalled();
    });

    it('withdraws every review of the account and says how many', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      reviewRepositoryMock.hideAuthorReviews.mockResolvedValue(12);

      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(reviewRepositoryMock.hideAuthorReviews).toHaveBeenCalledWith('abuser-1');
      // The number the confirmation quotes is what the database wrote, not what
      // the operator assumed — the same rule as bulk moderation.
      expect(response.body.data.updatedCount).toBe(12);
    });

    it('is not swallowed by the :id routes — "authors" reaches the right handler', async () => {
      // `:id/reply` is two segments and this is three, so nothing shadows it
      // today. The failure it guards against would surface as a 404 or a
      // malformed-UUID complaint, neither of which reads as a routing problem.
      const token = generateAccessToken(admin.id, admin.role);
      reviewRepositoryMock.hideAuthorReviews.mockResolvedValue(1);

      await request(app.getHttpServer())
        .post('/api/admin/reviews/authors/abuser-1/hide')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(reviewRepositoryMock.upsertReply).not.toHaveBeenCalled();
    });

    it('is allowed to a manager who may moderate', async () => {
      // Hiding an account's contribution IS moderation — a judgement about
      // somebody else's words — so it rides the controller's `reviews:moderate`
      // rather than the shop's own `reviews:write` voice.
      const token = generateAccessToken(manager.id, manager.role);
      reviewRepositoryMock.hideAuthorReviews.mockResolvedValue(3);

      await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(reviewRepositoryMock.hideAuthorReviews).toHaveBeenCalledWith('abuser-1');
    });
  });

  describe('POST /api/admin/reviews/authors/:userId/unhide', () => {
    const url = '/api/admin/reviews/authors/forgiven-1/unhide';

    it('returns 403 for a customer', async () => {
      const token = generateAccessToken(customer.id, customer.role);

      await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(reviewRepositoryMock.restoreAuthorReviews).not.toHaveBeenCalled();
    });

    it('gives the account its reviews back, and its ratings only if the address is proven', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      reviewRepositoryMock.isEmailVerified.mockResolvedValue(false);
      reviewRepositoryMock.restoreAuthorReviews.mockResolvedValue(5);

      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Lifting the moderator's verdict says nothing about the email gate; an
      // un-hide that forced `ratingVisible: true` would be a way around it.
      expect(reviewRepositoryMock.restoreAuthorReviews).toHaveBeenCalledWith('forgiven-1', false);
      expect(response.body.data.updatedCount).toBe(5);
    });
  });

  describe('POST /api/admin/reviews/:id/reply', () => {
    const url = '/api/admin/reviews/review-e2e-1/reply';

    it('returns 401 without a JWT', async () => {
      await request(app.getHttpServer()).post(url).send({ body: 'Дякуємо!' }).expect(401);
    });

    it('returns 403 for a customer', async () => {
      const token = generateAccessToken(customer.id, customer.role);
      await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'Дякуємо!' })
        .expect(403);

      expect(reviewRepositoryMock.upsertReply).not.toHaveBeenCalled();
    });

    it('saves the reply and records the acting admin as its author', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      reviewRepositoryMock.findById.mockResolvedValue(makeReview());
      reviewRepositoryMock.upsertReply.mockResolvedValue(makeReply());

      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'Дякуємо за відгук!' })
        .expect(200);

      expect(reviewRepositoryMock.upsertReply).toHaveBeenCalledWith(
        'review-e2e-1',
        admin.id,
        'Дякуємо за відгук!',
      );
      expect(response.body.data.body).toBe('Дякуємо за відгук!');
      // Recorded in the table, never on the wire — see the route's docblock.
      expect(response.body.data).not.toHaveProperty('authorUserId');
    });

    it('returns 404 for an unknown review', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      reviewRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/admin/reviews/missing/reply')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'Дякуємо!' })
        .expect(404);

      expect(reviewRepositoryMock.upsertReply).not.toHaveBeenCalled();
    });

    it('refuses an empty answer and one past the 1000-character cap', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      reviewRepositoryMock.findById.mockResolvedValue(makeReview());

      await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: '   ' })
        .expect(400);

      await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'x'.repeat(1001) })
        .expect(400);

      expect(reviewRepositoryMock.upsertReply).not.toHaveBeenCalled();
    });

    it('is refused to a manager who may moderate but not answer', async () => {
      // The point of the new permission. `reviews:moderate` decides whether a
      // sentence may be PUBLISHED; `reviews:write` decides whether the shop may
      // SAY something under its own name. A manager trusted with the first is not
      // automatically speaking for the business.
      const token = generateAccessToken(manager.id, manager.role);

      // Baseline: the moderation grant this manager does hold really works, so a
      // 403 below is about the missing permission and not about the manager.
      reviewRepositoryMock.findForModeration.mockResolvedValue({ reviews: [], total: 0 });
      await request(app.getHttpServer())
        .get('/api/admin/reviews')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'Дякуємо!' })
        .expect(403);

      expect(reviewRepositoryMock.upsertReply).not.toHaveBeenCalled();
    });

    it('is allowed to a manager once the owner ticks reviews:write', async () => {
      // Granted by handing the ACTOR the extra row, which is exactly where the
      // guard now looks (TASK-475). It used to be done through the real
      // `PUT /api/admin/permissions` so the real cache eviction ran; both the
      // endpoint and the cache are gone — rights arrive on the same read as the
      // person, so there is nothing left between the grant and the next request.
      jest.spyOn(permissionRepositoryMock, 'findActor').mockResolvedValue({
        id: manager.id,
        email: `${manager.id}@test.local`,
        role: UserRole.MANAGER,
        isOwner: false,
        permissions: new Set(['reviews:moderate', 'reviews:write']),
      });

      reviewRepositoryMock.findById.mockResolvedValue(makeReview());
      reviewRepositoryMock.upsertReply.mockResolvedValue(makeReply({ authorUserId: manager.id }));

      await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${generateAccessToken(manager.id, manager.role)}`)
        .send({ body: 'Дякуємо!' })
        .expect(200);

      expect(reviewRepositoryMock.upsertReply).toHaveBeenCalledWith(
        'review-e2e-1',
        manager.id,
        'Дякуємо!',
      );
    });
  });
});
