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
import { SiteContactRepository, SINGLETON_ID } from '../src/site-contact';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the SiteContact module (TASK-154).
 *
 * Mirrors pages.e2e-spec.ts: mocks AuthRepository, UserRepository,
 * SiteContactRepository, and PrismaService so no real database is required. JWT
 * tokens are minted directly via JwtService to bypass the rate-limited auth
 * endpoints.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('SiteContact (e2e)', () => {
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

  const siteContactRepositoryMock = {
    findSettings: jest.fn(),
    upsertSettings: jest.fn(),
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

  const settingsRow = {
    id: SINGLETON_ID,
    email: 'support@mobilestore.ua',
    phone: '+380 44 000 0000',
    workingHours: 'Пн–Нд: 9:00 – 20:00',
    viberLink: null,
    telegramLink: null,
    instagramLink: null,
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
      .overrideProvider(PermissionRepository)
      .useValue(createPermissionRepositoryMock())
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(SiteContactRepository)
      .useValue(siteContactRepositoryMock)
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

  describe('GET /api/site-contact', () => {
    it('returns an empty entity (all null fields) when the row is unseeded', async () => {
      siteContactRepositoryMock.findSettings.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/api/site-contact').expect(200);

      expect(response.body.data).toMatchObject({
        email: null,
        phone: null,
        workingHours: null,
        viberLink: null,
      });
    });

    it('returns the stored values once the row exists', async () => {
      siteContactRepositoryMock.findSettings.mockResolvedValue(settingsRow);

      const response = await request(app.getHttpServer()).get('/api/site-contact').expect(200);

      expect(response.body.data).toMatchObject({
        email: 'support@mobilestore.ua',
        phone: '+380 44 000 0000',
        workingHours: 'Пн–Нд: 9:00 – 20:00',
      });
    });
  });

  // ─── Admin guard ──────────────────────────────────────────────────────────────

  describe('PUT /api/admin/site-contact (auth)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .put('/api/admin/site-contact')
        .send({ email: 'hello@test.ua' })
        .expect(401);
    });

    it('returns 403 for a customer token', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .put('/api/admin/site-contact')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'hello@test.ua' })
        .expect(403);
    });
  });

  // ─── Admin mutation + validation ───────────────────────────────────────────────

  describe('PUT /api/admin/site-contact (admin)', () => {
    it('upserts the settings and returns the submitted values', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      const body = {
        email: 'hello@test.ua',
        phone: '+380 67 000 0000',
        workingHours: 'Пн–Пт 10–18',
      };
      siteContactRepositoryMock.upsertSettings.mockResolvedValue({ ...settingsRow, ...body });

      const response = await request(app.getHttpServer())
        .put('/api/admin/site-contact')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(response.body.data).toMatchObject(body);
      expect(siteContactRepositoryMock.upsertSettings).toHaveBeenCalledWith(body);
    });

    it('returns 400 for an invalid email', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .put('/api/admin/site-contact')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('returns 400 for an invalid social URL', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .put('/api/admin/site-contact')
        .set('Authorization', `Bearer ${token}`)
        .send({ viberLink: 'not-a-url' })
        .expect(400);
    });

    it('is idempotent — a repeated PUT returns the latest values', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      const body = { email: 'second@test.ua' };
      siteContactRepositoryMock.upsertSettings.mockResolvedValue({ ...settingsRow, ...body });

      const response = await request(app.getHttpServer())
        .put('/api/admin/site-contact')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(response.body.data).toMatchObject({ email: 'second@test.ua' });
    });
  });
});
