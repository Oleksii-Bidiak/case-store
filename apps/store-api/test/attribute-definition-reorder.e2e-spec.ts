import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AttributeType } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { AttributeDefinitionRepository } from '../src/attribute-definition';
import { CategoryRepository } from '../src/category';
import {
  ReorderDuplicateIdError,
  ReorderNotFoundError,
  ReorderStaleError,
} from '../src/common/reorder';
import { HttpExceptionFilter } from '../src/common/filters';
import { PrismaService } from '../src/prisma';

/**
 * E2E tests for the attribute-definition FLAT reorder endpoint (TASK-298):
 *
 *   PATCH /api/categories/:categoryId/attribute-definitions/reorder
 *
 * The fourth (and last) `sortOrder` writer moved onto the shared `common/reorder` recipe —
 * the sibling of `flat-reorder.e2e-spec.ts`, which covers banners / blog categories / device
 * brands. Repositories are mocked (no database): what is under test is the HTTP contract —
 * the admin guard, DTO validation, the `{ data }` envelope carrying the refreshed list, and
 * the stable domain error codes surviving `HttpExceptionFilter`'s envelope rebuild (the 409
 * on a stale/partial payload above all).
 */

// Pass-through guard that allows all requests (disables rate limiting in tests)
class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Attribute-definition reorder (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // Real UUIDs — `orderedIds` is `@IsUUID('4', { each: true })`.
  const categoryId = '550e8400-e29b-41d4-a716-446655440000';
  const idA = '550e8400-e29b-41d4-a716-446655440001';
  const idB = '550e8400-e29b-41d4-a716-446655440002';

  const url = `/api/categories/${categoryId}/attribute-definitions/reorder`;

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

  const attributeDefinitionRepositoryMock = {
    findByCategoryId: jest.fn(),
    findById: jest.fn(),
    findByCategoryAndKey: jest.fn(),
    findEffectiveForCategory: jest.fn(),
    findDistinctValuesByKey: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    reorder: jest.fn(),
  };

  const categoryRepositoryMock = {
    findById: jest.fn(),
    findAncestorIds: jest.fn(),
    findSubtreeIds: jest.fn(),
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

  const definitionRow = {
    id: idA,
    categoryId,
    key: 'material',
    label: 'Матеріал',
    type: AttributeType.TEXT,
    unit: null,
    options: null,
    isFilterable: false,
    sortOrder: 0,
  };

  function generateAccessToken(userId: string, role: 'ADMIN' | 'CUSTOMER'): string {
    return jwtService.sign(
      { sub: userId, email: `${userId}@example.com`, role },
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
      .overrideProvider(AttributeDefinitionRepository)
      .useValue(attributeDefinitionRepositoryMock)
      .overrideProvider(CategoryRepository)
      .useValue(categoryRepositoryMock)
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

    // Registered exactly as `main.ts` does: the reorder contract depends on the STABLE error
    // code surviving this filter's envelope rebuild (it reads ONLY `error` + `message` off the
    // thrown body), so asserting the code on the wire needs it.
    app.useGlobalFilters(moduleFixture.get(HttpExceptionFilter));

    app.setGlobalPrefix('api', { exclude: ['health'] });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    // The category exists unless a test says otherwise.
    categoryRepositoryMock.findById.mockResolvedValue({ id: categoryId, name: 'Чохли' });
  });

  const body = { orderedIds: [idB, idA] };

  it('returns 401 without an auth token', async () => {
    await request(app.getHttpServer()).patch(url).send(body).expect(401);
  });

  it('returns 403 for a non-admin user', async () => {
    const token = generateAccessToken('customer-e2e-1', 'CUSTOMER');

    await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(403);

    expect(attributeDefinitionRepositoryMock.reorder).not.toHaveBeenCalled();
  });

  it('returns 400 when an ordered id is not a uuid', async () => {
    const token = generateAccessToken('admin-e2e-1', 'ADMIN');

    await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderedIds: ['not-a-uuid'] })
      .expect(400);

    expect(attributeDefinitionRepositoryMock.reorder).not.toHaveBeenCalled();
  });

  it('returns 200 with the refreshed definition list', async () => {
    const token = generateAccessToken('admin-e2e-1', 'ADMIN');
    attributeDefinitionRepositoryMock.reorder.mockResolvedValue([definitionRow]);

    const response = await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ id: idA, key: 'material', sortOrder: 0 });
    expect(attributeDefinitionRepositoryMock.reorder).toHaveBeenCalledWith(categoryId, [idB, idA]);
    // The refreshed list comes out of the reorder transaction — no second read.
    expect(attributeDefinitionRepositoryMock.findByCategoryId).not.toHaveBeenCalled();
  });

  it('returns 404 when the category does not exist', async () => {
    const token = generateAccessToken('admin-e2e-1', 'ADMIN');
    categoryRepositoryMock.findById.mockResolvedValue(null);

    await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(404);

    expect(attributeDefinitionRepositoryMock.reorder).not.toHaveBeenCalled();
  });

  // The regression this task exists for: a payload that does not name EVERY template of the
  // category means a second admin added one underneath the client. It must be a 409, never a
  // silent partial write.
  it('surfaces REORDER_STALE as a 409 with the stable code', async () => {
    const token = generateAccessToken('admin-e2e-1', 'ADMIN');
    attributeDefinitionRepositoryMock.reorder.mockRejectedValue(new ReorderStaleError());

    const response = await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderedIds: [idA] })
      .expect(409);

    expect(response.body).toMatchObject({ error: 'REORDER_STALE', statusCode: 409 });
  });

  it('surfaces REORDER_DUPLICATE_ID as a 400 with the stable code', async () => {
    const token = generateAccessToken('admin-e2e-1', 'ADMIN');
    attributeDefinitionRepositoryMock.reorder.mockRejectedValue(new ReorderDuplicateIdError());

    const response = await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderedIds: [idA, idA] })
      .expect(400);

    expect(response.body).toMatchObject({ error: 'REORDER_DUPLICATE_ID', statusCode: 400 });
  });

  it('surfaces REORDER_NOT_FOUND as a 404 with the stable code', async () => {
    const token = generateAccessToken('admin-e2e-1', 'ADMIN');
    attributeDefinitionRepositoryMock.reorder.mockRejectedValue(new ReorderNotFoundError());

    const response = await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(404);

    expect(response.body).toMatchObject({ error: 'REORDER_NOT_FOUND', statusCode: 404 });
  });
});
