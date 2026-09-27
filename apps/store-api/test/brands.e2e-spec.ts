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
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E for the admin brand list (TASK-840, AD-CAT-12):
 *
 *   GET /api/brands/admin/list
 *
 * `/brands` was a bare name table — no logo, no product count — so an operator
 * could not tell a brand in use from an empty one without opening the catalogue.
 * The API now returns the logo it always had plus `productCount`.
 *
 * `PrismaService` is mocked but the REAL `BrandRepository` runs, so what is under
 * test is the query the repository builds (a grouped `_count` of LIVE products —
 * `deletedAt: null`, hidden ones included) and how it surfaces over HTTP.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Admin brand list (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const idA = '550e8400-e29b-41d4-a716-446655440001';
  const idB = '550e8400-e29b-41d4-a716-446655440002';
  const at = new Date('2026-07-01T00:00:00.000Z');

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
    brand: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  function token(sub: string, role: 'ADMIN' | 'MANAGER'): string {
    return jwtService.sign(
      { sub, email: `${sub}@example.com`, role },
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

  it('returns each brand with its logo and live product count', async () => {
    prismaServiceMock.brand.findMany.mockResolvedValue([
      {
        id: idA,
        name: 'Spigen',
        slug: 'spigen',
        logo: 'https://cdn.example.com/spigen.svg',
        isActive: true,
        createdAt: at,
        updatedAt: at,
        _count: { products: 12 },
      },
      {
        id: idB,
        name: 'Zagg',
        slug: 'zagg',
        logo: null,
        isActive: false,
        createdAt: at,
        updatedAt: at,
        _count: { products: 0 },
      },
    ]);
    prismaServiceMock.brand.count.mockResolvedValue(2);

    const response = await request(app.getHttpServer())
      .get('/api/brands/admin/list')
      .set('Authorization', `Bearer ${token('admin-e2e-1', 'ADMIN')}`)
      .expect(200);

    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: idA,
        logo: 'https://cdn.example.com/spigen.svg',
        productCount: 12,
      }),
      // 0 is an answer («nothing uses this brand»), not a missing field.
      expect.objectContaining({ id: idB, logo: null, productCount: 0 }),
    ]);
    // The Prisma aggregate is an implementation detail and must not leak.
    expect(response.body.data[0]).not.toHaveProperty('_count');
    expect(response.body.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });
  });

  it('counts live products — soft-deleted excluded, hidden included — in ONE query', async () => {
    prismaServiceMock.brand.findMany.mockResolvedValue([]);
    prismaServiceMock.brand.count.mockResolvedValue(0);

    await request(app.getHttpServer())
      .get('/api/brands/admin/list?page=2&limit=5&search=spi')
      .set('Authorization', `Bearer ${token('admin-e2e-1', 'ADMIN')}`)
      .expect(200);

    expect(prismaServiceMock.brand.findMany).toHaveBeenCalledTimes(1);
    expect(prismaServiceMock.brand.findMany).toHaveBeenCalledWith({
      where: { name: { contains: 'spi', mode: 'insensitive' } },
      skip: 5,
      take: 5,
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
  });

  it('refuses a manager without brands:write before touching the database', async () => {
    await request(app.getHttpServer())
      .get('/api/brands/admin/list')
      .set('Authorization', `Bearer ${token('manager-e2e-1', 'MANAGER')}`)
      .expect(403);

    expect(prismaServiceMock.brand.findMany).not.toHaveBeenCalled();
  });
});
