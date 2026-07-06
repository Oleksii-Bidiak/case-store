import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { FaqRepository } from '../src/faq';
import { PrismaService } from '../src/prisma';

/**
 * E2E tests for the FAQ module (TASK-242).
 *
 * Mirrors seo-settings.e2e-spec.ts: mocks AuthRepository, UserRepository,
 * FaqRepository, and PrismaService so no real database is required. JWT tokens
 * are minted directly via JwtService to bypass the rate-limited auth endpoints.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('FAQ (e2e)', () => {
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
  };

  const userRepositoryMock = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
  };

  const faqRepositoryMock = {
    findAllActive: jest.fn(),
    findAllAdmin: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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

  const testAdmin = { id: 'admin-e2e-1', role: 'ADMIN' as const };
  const testCustomer = { id: 'customer-e2e-1', role: 'CUSTOMER' as const };

  const faqRow = {
    id: 'faq-e2e-1',
    question: 'Скільки коштує доставка?',
    answer: 'Безкоштовно від 1 000 ₴.',
    sortOrder: 0,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

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
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(FaqRepository)
      .useValue(faqRepositoryMock)
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

  // ─── Public endpoint ──────────────────────────────────────────────────────────

  describe('GET /api/faq', () => {
    it('returns active FAQ items', async () => {
      faqRepositoryMock.findAllActive.mockResolvedValue([faqRow]);

      const response = await request(app.getHttpServer()).get('/api/faq').expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        question: 'Скільки коштує доставка?',
        isActive: true,
        sortOrder: 0,
      });
    });

    it('returns an empty list when there are no active items', async () => {
      faqRepositoryMock.findAllActive.mockResolvedValue([]);

      const response = await request(app.getHttpServer()).get('/api/faq').expect(200);

      expect(response.body.data).toEqual([]);
    });
  });

  // ─── Admin guard ──────────────────────────────────────────────────────────────

  describe('admin FAQ (auth)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/admin/faq').expect(401);
    });

    it('returns 403 for a customer token', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .post('/api/admin/faq')
        .set('Authorization', `Bearer ${token}`)
        .send({ question: 'Q', answer: 'A' })
        .expect(403);
    });
  });

  // ─── Admin CRUD ────────────────────────────────────────────────────────────────

  describe('admin FAQ CRUD (admin)', () => {
    it('lists all items (any status)', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      faqRepositoryMock.findAllAdmin.mockResolvedValue([
        faqRow,
        { ...faqRow, id: 'faq-e2e-2', isActive: false },
      ]);

      const response = await request(app.getHttpServer())
        .get('/api/admin/faq')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });

    it('creates an item and returns the created entity', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      const body = { question: 'Нове питання?', answer: 'Нова відповідь.', sortOrder: 2 };
      faqRepositoryMock.create.mockResolvedValue({ ...faqRow, ...body });

      const response = await request(app.getHttpServer())
        .post('/api/admin/faq')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(201);

      expect(response.body.data).toMatchObject(body);
      expect(faqRepositoryMock.create).toHaveBeenCalledWith({
        question: 'Нове питання?',
        answer: 'Нова відповідь.',
        sortOrder: 2,
        isActive: undefined,
      });
    });

    it('returns 400 when question is missing', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .post('/api/admin/faq')
        .set('Authorization', `Bearer ${token}`)
        .send({ answer: 'Відповідь без питання.' })
        .expect(400);
    });

    it('updates an existing item', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      faqRepositoryMock.findById.mockResolvedValue(faqRow);
      faqRepositoryMock.update.mockResolvedValue({ ...faqRow, isActive: false });

      const response = await request(app.getHttpServer())
        .put('/api/admin/faq/faq-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ isActive: false })
        .expect(200);

      expect(response.body.data.isActive).toBe(false);
    });

    it('returns 404 when updating a missing item', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      faqRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .put('/api/admin/faq/ghost')
        .set('Authorization', `Bearer ${token}`)
        .send({ question: 'X' })
        .expect(404);
    });

    it('deletes an item and returns its id', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      faqRepositoryMock.findById.mockResolvedValue(faqRow);
      faqRepositoryMock.delete.mockResolvedValue(faqRow);

      const response = await request(app.getHttpServer())
        .delete('/api/admin/faq/faq-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toEqual({ id: 'faq-e2e-1' });
    });

    it('returns 404 when deleting a missing item', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      faqRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/api/admin/faq/ghost')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
