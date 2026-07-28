import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ContactMessageStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { ContactRepository } from '../src/contact/contact.repository';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the Contact module admin inbox (TASK-177 + TASK-256).
 *
 * Mirrors site-contact.e2e-spec.ts: mocks AuthRepository, ContactRepository,
 * and PrismaService so no real database is required. JWT tokens are minted
 * directly via JwtService to bypass the rate-limited auth endpoints.
 *
 * TASK-256 coverage: the IN_PROGRESS status round-trips through the list
 * filter and the PATCH endpoint, and `matchedUserId` reflects the (mocked)
 * live sender→user email match.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Contact admin inbox (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
    savePasswordResetToken: jest.fn(),
    findPasswordResetToken: jest.fn(),
    markPasswordResetTokenUsed: jest.fn(),
    invalidateActivePasswordResetTokens: jest.fn(),
    updatePasswordHash: jest.fn(),
  };

  const contactRepositoryMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    countByStatus: jest.fn(),
    findMatchingUserId: jest.fn(),
    findMatchingUserIds: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const testAdmin = { id: 'admin-e2e-1', role: 'ADMIN' as const };
  const testCustomer = { id: 'customer-e2e-1', role: 'CUSTOMER' as const };

  const now = new Date('2026-07-10T10:00:00.000Z');

  const makeMessageRow = (overrides: Record<string, unknown> = {}) => ({
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Ivan Petrenko',
    phone: '+380671234567',
    email: 'ivan@example.com',
    topic: 'order',
    orderRef: 'ORD-10231',
    message: 'Доброго дня! Питання по замовленню.',
    status: ContactMessageStatus.NEW,
    adminNote: null,
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
      .useValue(createPermissionRepositoryMock())
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(ContactRepository)
      .useValue(contactRepositoryMock)
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

  // ─── Auth guard ───────────────────────────────────────────────────────────────

  describe('GET /api/contact/admin (auth)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/contact/admin').expect(401);
    });

    it('returns 403 for a customer token', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .get('/api/contact/admin')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  // ─── List + IN_PROGRESS filter (TASK-256) ─────────────────────────────────────

  describe('GET /api/contact/admin', () => {
    it('accepts ?status=IN_PROGRESS and passes it through to the repository', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      contactRepositoryMock.findAll.mockResolvedValue({
        messages: [makeMessageRow({ status: ContactMessageStatus.IN_PROGRESS })],
        total: 1,
      });
      contactRepositoryMock.countByStatus.mockResolvedValue(0);
      contactRepositoryMock.findMatchingUserIds.mockResolvedValue(new Map());

      const response = await request(app.getHttpServer())
        .get('/api/contact/admin')
        .query({ status: 'IN_PROGRESS' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data[0].status).toBe('IN_PROGRESS');
      expect(contactRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: ContactMessageStatus.IN_PROGRESS }),
      );
    });

    it('rejects an unknown status value with 400', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .get('/api/contact/admin')
        .query({ status: 'BOGUS' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('populates matchedUserId per row from the batched email match', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      contactRepositoryMock.findAll.mockResolvedValue({
        messages: [
          makeMessageRow(),
          makeMessageRow({
            id: '550e8400-e29b-41d4-a716-446655440002',
            email: 'guest@example.com',
          }),
        ],
        total: 2,
      });
      contactRepositoryMock.countByStatus.mockResolvedValue(1);
      contactRepositoryMock.findMatchingUserIds.mockResolvedValue(
        new Map([['ivan@example.com', 'user-uuid-1']]),
      );

      const response = await request(app.getHttpServer())
        .get('/api/contact/admin')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].matchedUserId).toBe('user-uuid-1');
      expect(response.body.data[1].matchedUserId).toBeNull();
    });
  });

  // ─── Single message (TASK-256 matchedUserId) ──────────────────────────────────

  describe('GET /api/contact/admin/:id', () => {
    it('returns matchedUserId when the sender email matches a registered user', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      contactRepositoryMock.findById.mockResolvedValue(makeMessageRow());
      contactRepositoryMock.findMatchingUserId.mockResolvedValue('user-uuid-1');

      const response = await request(app.getHttpServer())
        .get('/api/contact/admin/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.matchedUserId).toBe('user-uuid-1');
      expect(contactRepositoryMock.findMatchingUserId).toHaveBeenCalledWith('ivan@example.com');
    });

    it('returns matchedUserId: null when there is no registered match', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      contactRepositoryMock.findById.mockResolvedValue(makeMessageRow());
      contactRepositoryMock.findMatchingUserId.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get('/api/contact/admin/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.matchedUserId).toBeNull();
    });

    it('returns 404 for a missing message', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      contactRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/contact/admin/550e8400-e29b-41d4-a716-446655440099')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ─── Status transition to IN_PROGRESS (TASK-256) ──────────────────────────────

  describe('PATCH /api/contact/admin/:id', () => {
    it('accepts { status: IN_PROGRESS } and returns the updated message', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      contactRepositoryMock.findById.mockResolvedValue(makeMessageRow());
      contactRepositoryMock.update.mockResolvedValue(
        makeMessageRow({ status: ContactMessageStatus.IN_PROGRESS }),
      );
      contactRepositoryMock.findMatchingUserId.mockResolvedValue('user-uuid-1');

      const response = await request(app.getHttpServer())
        .patch('/api/contact/admin/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      expect(response.body.data.status).toBe('IN_PROGRESS');
      expect(response.body.data.matchedUserId).toBe('user-uuid-1');
      expect(contactRepositoryMock.update).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        expect.objectContaining({ status: ContactMessageStatus.IN_PROGRESS }),
      );
    });

    it('rejects an unknown status with 400', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch('/api/contact/admin/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'BOGUS' })
        .expect(400);
    });

    it('returns 403 for a customer token', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .patch('/api/contact/admin/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(403);
    });
  });
});
