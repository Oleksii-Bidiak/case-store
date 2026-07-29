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
import { NewsletterRepository } from '../src/newsletter/newsletter.repository';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E for the admin subscriber list's sort contract (TASK-356).
 *
 * The point of the suite is the boundary, not the ordering itself: an unknown
 * `sortBy` must be REFUSED by validation. The failure this guards against is the
 * quiet one — a rejected field falling through to a default, so the operator
 * clicks a column, sees the rows not move, and has no way to tell whether the
 * data is genuinely in that order or the sort never happened.
 *
 * NewsletterRepository is mocked, so the assertions are about what the DTO lets
 * through and what the service forwards. That the ordering reaches Prisma is
 * covered in newsletter.repository.spec.ts.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Admin subscriber list — sorting (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const admin = { id: 'admin-e2e-newsletter', role: 'ADMIN' as const };

  const newsletterRepositoryMock = {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    findAllForExport: jest.fn(),
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
    auditLog: { create: jest.fn() },
  };

  function adminAuth(): string {
    const token = jwtService.sign(
      { sub: admin.id, role: admin.role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    return `Bearer ${token}`;
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
      .overrideProvider(NewsletterRepository)
      .useValue(newsletterRepositoryMock)
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

  beforeEach(() => {
    jest.clearAllMocks();
    newsletterRepositoryMock.findAll.mockResolvedValue({ subscriptions: [], total: 0 });
  });

  it.each(['createdAt', 'email', 'status'])(
    'accepts sortBy=%s and forwards it to the repository',
    async (sortBy) => {
      await request(app.getHttpServer())
        .get(`/api/newsletter/admin?sortBy=${sortBy}&sortOrder=asc`)
        .set('Authorization', adminAuth())
        .expect(200);

      expect(newsletterRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy, sortOrder: 'asc' }),
      );
    },
  );

  it('defaults to createdAt desc when the client asks for nothing', async () => {
    await request(app.getHttpServer())
      .get('/api/newsletter/admin')
      .set('Authorization', adminAuth())
      .expect(200);

    expect(newsletterRepositoryMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'createdAt', sortOrder: 'desc' }),
    );
  });

  it('rejects an unknown sortBy with 400 — never a 500, never a silent default', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/newsletter/admin?sortBy=passwordHash')
      .set('Authorization', adminAuth())
      .expect(400);

    expect(JSON.stringify(response.body)).toContain('sortBy must be one of');
    expect(newsletterRepositoryMock.findAll).not.toHaveBeenCalled();
  });

  it('rejects an unknown sortOrder with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/newsletter/admin?sortBy=email&sortOrder=sideways')
      .set('Authorization', adminAuth())
      .expect(400);

    expect(newsletterRepositoryMock.findAll).not.toHaveBeenCalled();
  });

  it('rejects a misspelled sort parameter rather than ignoring it', async () => {
    // `forbidNonWhitelisted` is what turns a typo into a visible 400. Without it
    // `sortDirection=asc` would be dropped in silence and the list would come
    // back in the default order, looking like the sort simply did not work.
    await request(app.getHttpServer())
      .get('/api/newsletter/admin?sortBy=email&sortDirection=asc')
      .set('Authorization', adminAuth())
      .expect(400);

    expect(newsletterRepositoryMock.findAll).not.toHaveBeenCalled();
  });

  it('keeps the sort independent of the existing filters', async () => {
    await request(app.getHttpServer())
      .get('/api/newsletter/admin?status=SUBSCRIBED&search=user&sortBy=email&sortOrder=asc&page=2')
      .set('Authorization', adminAuth())
      .expect(200);

    expect(newsletterRepositoryMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'SUBSCRIBED',
        search: 'user',
        page: 2,
        sortBy: 'email',
        sortOrder: 'asc',
      }),
    );
  });

  it('refuses a customer before it ever looks at the sort parameters', async () => {
    // Guards run ahead of pipes, so the new query fields add no way to probe an
    // endpoint the caller cannot reach: the answer is 403, not a 400 that would
    // confirm the route exists and reveal its allow-list.
    const customerToken = jwtService.sign(
      { sub: 'customer-e2e-newsletter', role: 'CUSTOMER' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );

    await request(app.getHttpServer())
      .get('/api/newsletter/admin?sortBy=passwordHash')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    expect(newsletterRepositoryMock.findAll).not.toHaveBeenCalled();
  });
});
