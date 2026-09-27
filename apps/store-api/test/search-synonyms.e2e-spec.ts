import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { MeiliClient, PRODUCTS_INDEX, BLOG_POSTS_INDEX } from '../src/search';
import { DEFAULT_SYNONYM_GROUPS } from '../src/search/search-synonyms';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E for the admin-edited search synonyms (TASK-559):
 * `GET|PUT /api/admin/search/synonyms`.
 *
 * PrismaService and MeiliClient are mocked (no database, no engine), so this
 * proves the HTTP contract end to end — guard → DTO normalisation/validation →
 * service → repository calls → engine push — without infrastructure.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const URL = '/api/admin/search/synonyms';

describe('Search synonyms (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  /** The table, as far as the mock knows it. */
  let savedRows: Array<{ terms: string[]; sortOrder: number }> = [];

  const searchSynonymGroup = {
    findMany: jest.fn(async () => savedRows.map((row) => ({ terms: row.terms }))),
    deleteMany: jest.fn((): Promise<unknown> => {
      savedRows = [];
      return Promise.resolve({ count: 0 });
    }),
    createMany: jest.fn(
      ({ data }: { data: Array<{ terms: string[]; sortOrder: number }> }): Promise<unknown> => {
        savedRows = [...data];
        return Promise.resolve({ count: data.length });
      },
    ),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    // The array form: the operations are already-started promises.
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    searchSynonymGroup,
    // Boot-time reads other modules make; empty answers are enough here.
    product: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    blogPost: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
  };

  const meiliClientMock = {
    isConfigured: jest.fn(() => true),
    health: jest.fn(async () => true),
    ensureIndex: jest.fn(async () => undefined),
    indexDocuments: jest.fn(async () => null),
    deleteDocument: jest.fn(async () => undefined),
    deleteDocuments: jest.fn(async () => null),
    listDocumentIds: jest.fn(async () => new Set<string>()),
    waitForTasks: jest.fn(async () => ({ failedUids: [] })),
    search: jest.fn(async () => ({ hits: [], totalHits: 0 })),
    updateSynonyms: jest.fn(async () => true),
  };

  const token = (userId: string, role: string) =>
    jwtService.sign({ sub: userId, role }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });

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
      // A manager holds nothing by default — the 403 case below.
      .overrideProvider(PermissionRepository)
      .useValue(createPermissionRepositoryMock())
      .overrideProvider(MeiliClient)
      .useValue(meiliClientMock)
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
    savedRows = [];
    meiliClientMock.isConfigured.mockReturnValue(true);
    meiliClientMock.updateSynonyms.mockResolvedValue(true);
  });

  const admin = () => `Bearer ${token('admin-e2e-1', 'ADMIN')}`;

  describe('GET', () => {
    it('200 — the built-in dictionary while nothing is saved', async () => {
      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', admin())
        .expect(200);

      expect(res.body.data.isDefault).toBe(true);
      expect(res.body.data.groups).toHaveLength(DEFAULT_SYNONYM_GROUPS.length);
      expect(res.body.data.groups[0]).toEqual({ terms: [...DEFAULT_SYNONYM_GROUPS[0]] });
    });

    it('200 — the saved list once there is one', async () => {
      savedRows = [{ terms: ['гаджет', 'gadget'], sortOrder: 0 }];

      const res = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', admin())
        .expect(200);

      expect(res.body.data).toEqual({
        isDefault: false,
        groups: [{ terms: ['гаджет', 'gadget'] }],
      });
    });
  });

  describe('PUT', () => {
    it('200 — saves the normalised list and pushes it to both indexes', async () => {
      const res = await request(app.getHttpServer())
        .put(URL)
        .set('Authorization', admin())
        .send({
          groups: [{ terms: [' Гаджет', 'GADGET', 'гаджет'] }, { terms: ['чохол', 'case'] }],
        })
        .expect(200);

      expect(res.body.data).toEqual({
        isDefault: false,
        appliedToSearch: true,
        groups: [{ terms: ['гаджет', 'gadget'] }, { terms: ['чохол', 'case'] }],
      });
      expect(searchSynonymGroup.createMany).toHaveBeenCalledWith({
        data: [
          { terms: ['гаджет', 'gadget'], sortOrder: 0 },
          { terms: ['чохол', 'case'], sortOrder: 1 },
        ],
      });
      expect(meiliClientMock.updateSynonyms).toHaveBeenCalledWith(
        expect.objectContaining({ gadget: ['гаджет'] }),
        PRODUCTS_INDEX,
      );
      expect(meiliClientMock.updateSynonyms).toHaveBeenCalledWith(
        expect.objectContaining({ gadget: ['гаджет'] }),
        BLOG_POSTS_INDEX,
      );
    });

    it('200 — still saves when the engine is down, and says so', async () => {
      meiliClientMock.updateSynonyms.mockResolvedValue(false);

      const res = await request(app.getHttpServer())
        .put(URL)
        .set('Authorization', admin())
        .send({ groups: [{ terms: ['гаджет', 'gadget'] }] })
        .expect(200);

      expect(res.body.data.appliedToSearch).toBe(false);
      expect(savedRows).toHaveLength(1);
    });

    it('200 — an empty list restores the built-in dictionary', async () => {
      savedRows = [{ terms: ['гаджет', 'gadget'], sortOrder: 0 }];

      const res = await request(app.getHttpServer())
        .put(URL)
        .set('Authorization', admin())
        .send({ groups: [] })
        .expect(200);

      expect(res.body.data.isDefault).toBe(true);
      expect(savedRows).toEqual([]);
    });

    it.each([
      ['a one-word group', { groups: [{ terms: ['чохол', 'Чохол'] }] }],
      ['a term with a space', { groups: [{ terms: ['usb c', 'usbc'] }] }],
      ['a term with a hyphen', { groups: [{ terms: ['type-c', 'typec'] }] }],
      ['a missing groups field', {}],
      ['an unknown field', { groups: [{ terms: ['a', 'b'], id: 'x' }] }],
    ])('400 — %s, and nothing is written', async (_, body) => {
      await request(app.getHttpServer())
        .put(URL)
        .set('Authorization', admin())
        .send(body)
        .expect(400);

      expect(searchSynonymGroup.deleteMany).not.toHaveBeenCalled();
      expect(meiliClientMock.updateSynonyms).not.toHaveBeenCalled();
    });
  });

  describe('access', () => {
    it('401 without a token', async () => {
      await request(app.getHttpServer()).get(URL).expect(401);
    });

    it.each([
      ['a manager without settings:search', 'manager-e2e-1', 'MANAGER'],
      ['a customer', 'customer-e2e-1', 'CUSTOMER'],
    ])('403 for %s — read and write', async (_, userId, role) => {
      const auth = `Bearer ${token(userId, role)}`;
      await request(app.getHttpServer()).get(URL).set('Authorization', auth).expect(403);
      await request(app.getHttpServer())
        .put(URL)
        .set('Authorization', auth)
        .send({ groups: [] })
        .expect(403);

      expect(searchSynonymGroup.deleteMany).not.toHaveBeenCalled();
    });
  });
});
