import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { AddonApplicabilityResolver } from '../src/addon-service/addon-applicability.resolver';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * One visibility rule on every public read of a product (TASK-781 / TASK-782).
 *
 * Unlike most e2e suites here, the REAL repositories run: only PrismaService is
 * replaced, by a tiny in-memory table that EVALUATES the `where` it is handed
 * (`id`/`slug`/`groupId` — plain or `{ in }` — `isActive`, `deletedAt`,
 * `category.isActive`). A mock that answered by fixture would pass no matter
 * which predicate the repository sent; this one only returns a row the
 * predicate actually admits, so the tests below fail the moment a public read
 * drops a half of the rule — which is exactly how the variant siblings leaked
 * a withdrawn category's positions into the colour dots and «від X ₴».
 *
 * An unsupported operator throws instead of matching, so the fake can never
 * pass silently on a clause it does not understand.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

type Row = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: { toString(): string };
  compareAtPrice: null;
  sku: string | null;
  stock: number;
  categoryId: string;
  groupId: string | null;
  brandId: null;
  attributes: Record<string, string>;
  positionOrder: number;
  isActive: boolean;
  deletedAt: Date | null;
  metaTitle: null;
  metaDescription: null;
  keywords: string[];
  ogImage: null;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string; slug: string; isActive: boolean };
};

const ACTIVE_CATEGORY = { id: 'cat-on', name: 'Чохли', slug: 'chokhly', isActive: true };
const HIDDEN_CATEGORY = { id: 'cat-off', name: 'Архів', slug: 'arkhiv', isActive: false };

/** UUIDs — `GET /products/cards` validates its ids. */
const ID = {
  visible: '11111111-1111-4111-8111-111111111111',
  draft: '22222222-2222-4222-8222-222222222222',
  inHiddenCategory: '33333333-3333-4333-8333-333333333333',
  deleted: '44444444-4444-4444-8444-444444444444',
  siblingVisible: '55555555-5555-4555-8555-555555555555',
  siblingHiddenCategory: '66666666-6666-4666-8666-666666666666',
  siblingDraft: '77777777-7777-4777-8777-777777777777',
  missing: '99999999-9999-4999-8999-999999999999',
};

function row(overrides: Partial<Row> & Pick<Row, 'id' | 'slug'>): Row {
  return {
    name: `Товар ${overrides.slug}`,
    description: null,
    price: { toString: () => '500' },
    compareAtPrice: null,
    sku: null,
    stock: 5,
    categoryId: ACTIVE_CATEGORY.id,
    groupId: null,
    brandId: null,
    attributes: {},
    positionOrder: 0,
    isActive: true,
    deletedAt: null,
    metaTitle: null,
    metaDescription: null,
    keywords: [],
    ogImage: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    category: ACTIVE_CATEGORY,
    ...overrides,
  };
}

/**
 * The catalogue. `visible` heads a colour group of four positions: one more
 * visible sibling (Чорний, 700 ₴), one whose CATEGORY is withdrawn (Червоний,
 * 100 ₴ — the cheapest, so if it leaked it would become «від 100 ₴»), and a
 * draft (Синій, 50 ₴).
 */
const ROWS: Row[] = [
  row({
    id: ID.visible,
    slug: 'visible',
    groupId: 'grp-1',
    attributes: { Колір: 'Білий' },
    price: { toString: () => '500' },
  }),
  row({
    id: ID.siblingVisible,
    slug: 'sibling-visible',
    groupId: 'grp-1',
    positionOrder: 1,
    attributes: { Колір: 'Чорний' },
    price: { toString: () => '700' },
  }),
  row({
    id: ID.siblingHiddenCategory,
    slug: 'sibling-hidden-category',
    groupId: 'grp-1',
    positionOrder: 2,
    attributes: { Колір: 'Червоний' },
    price: { toString: () => '100' },
    categoryId: HIDDEN_CATEGORY.id,
    category: HIDDEN_CATEGORY,
  }),
  row({
    id: ID.siblingDraft,
    slug: 'sibling-draft',
    groupId: 'grp-1',
    positionOrder: 3,
    attributes: { Колір: 'Синій' },
    price: { toString: () => '50' },
    isActive: false,
  }),
  row({ id: ID.draft, slug: 'draft', isActive: false }),
  row({
    id: ID.inHiddenCategory,
    slug: 'in-hidden-category',
    categoryId: HIDDEN_CATEGORY.id,
    category: HIDDEN_CATEGORY,
  }),
  row({ id: ID.deleted, slug: 'deleted', isActive: false, deletedAt: new Date('2026-02-01') }),
];

/** Does `target` satisfy the Prisma-style `where`? Throws on anything it does not know. */
function matches(target: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = target[key];
    if (key === 'category') {
      return matches(value as Record<string, unknown>, cond as Record<string, unknown>);
    }
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const ops = Object.keys(cond);
      if (ops.length === 1 && ops[0] === 'in') {
        return (cond as { in: unknown[] }).in.includes(value);
      }
      throw new Error(`fake prisma: unsupported condition on "${key}": ${JSON.stringify(cond)}`);
    }
    if (!['id', 'slug', 'groupId', 'isActive', 'deletedAt', 'categoryId'].includes(key)) {
      throw new Error(`fake prisma: unsupported key "${key}"`);
    }
    return value === cond;
  });
}

type FindArgs = {
  where?: Record<string, unknown>;
  include?: {
    group?: { include?: { positions?: { where?: Record<string, unknown> } } };
  };
};

/** Shape a row the way the repository's `include` asks for (only what these reads use). */
function shape(found: Row, args: FindArgs) {
  const out: Record<string, unknown> = { ...found, brand: null, images: [], specValues: [] };
  if (args.include?.group) {
    out.group = found.groupId
      ? {
          id: found.groupId,
          name: 'Група',
          axes: [{ name: 'Колір', sortOrder: 0 }],
          positions: ROWS.filter(
            (r) =>
              r.groupId === found.groupId &&
              matches(r, args.include?.group?.include?.positions?.where),
          ).sort((a, b) => a.positionOrder - b.positionOrder),
        }
      : null;
  }
  return out;
}

describe('Public product visibility (e2e, TASK-781/782)', () => {
  let app: INestApplication;

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    product: {
      findFirst: jest.fn(async (args: FindArgs) => {
        const found = ROWS.find((r) => matches(r, args.where));
        return found ? shape(found, args) : null;
      }),
      findMany: jest.fn(async (args: FindArgs) =>
        ROWS.filter((r) => matches(r, args.where))
          .sort((a, b) => a.positionOrder - b.positionOrder)
          .map((r) => shape(r, args)),
      ),
    },
    productImage: { findMany: jest.fn(async () => []) },
    productDeviceCompat: { findMany: jest.fn(async () => []) },
    review: { groupBy: jest.fn(async () => []) },
    wishlist: {
      upsert: jest.fn(async () => ({
        id: 'wl-1',
        userId: null,
        token: 'guest',
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
      })),
    },
    wishlistItem: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(),
    },
  };

  // The resolver's own maths is unit-tested; here it only has to answer for
  // the products the service lets through.
  const resolverMock = {
    resolveForProduct: jest.fn(async () => [
      {
        addonServiceId: 'svc-1',
        name: 'Наклеювання скла',
        description: null,
        price: '150.00',
        source: 'inherited',
      },
    ]),
  };

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
      .overrideProvider(AddonApplicabilityResolver)
      .useValue(resolverMock)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
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

  describe('GET /api/addon-services/resolved-for-product/:id (TASK-781)', () => {
    const url = (id: string) => `/api/addon-services/resolved-for-product/${id}`;

    it('resolves the add-ons of a product on sale', async () => {
      const res = await request(app.getHttpServer()).get(url(ID.visible)).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ price: '150.00' });
    });

    it.each([
      ['a draft', ID.draft],
      ['a product in a deactivated category', ID.inHiddenCategory],
      ['a soft-deleted product', ID.deleted],
    ])('answers %s exactly like a nonexistent id — 404, no prices', async (_label, id) => {
      const hidden = await request(app.getHttpServer()).get(url(id)).expect(404);
      const missing = await request(app.getHttpServer()).get(url(ID.missing)).expect(404);

      expect(hidden.body.message).toBe(missing.body.message);
      expect(JSON.stringify(hidden.body)).not.toContain('150.00');
    });
  });

  describe('GET /api/products/:slug (TASK-781/782)', () => {
    it('answers a draft exactly like a missing slug', async () => {
      const draft = await request(app.getHttpServer()).get('/api/products/draft').expect(404);
      const missing = await request(app.getHttpServer())
        .get('/api/products/no-such-slug')
        .expect(404);
      expect(draft.body.message).toBe(missing.body.message);
    });

    it('answers a product of a deactivated category with 404', async () => {
      await request(app.getHttpServer()).get('/api/products/in-hidden-category').expect(404);
    });

    it('offers only publicly visible siblings in the variant switcher', async () => {
      const res = await request(app.getHttpServer()).get('/api/products/visible').expect(200);

      const slugs = (res.body.group.positions as Array<{ slug: string }>).map((p) => p.slug);
      expect(slugs).toEqual(['visible', 'sibling-visible']);
      expect(slugs).not.toContain('sibling-hidden-category');
      expect(slugs).not.toContain('sibling-draft');
    });
  });

  describe('GET /api/products/cards — colour dots and «від X ₴» (TASK-782)', () => {
    it('drops a sibling of a deactivated category from the dots and from the from-price', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products/cards')
        .query({ ids: ID.visible })
        .expect(200);

      const summary = res.body.data[0].variantSummary;
      const colours = (summary.colors as Array<{ value: string }>).map((c) => c.value);
      expect(colours).toEqual(['Білий', 'Чорний']);
      // The withdrawn sibling costs 100 and the draft 50 — either leaking would
      // advertise a price nobody can buy at.
      expect(summary.priceFrom).toBe('500');
      expect(summary.variantCount).toBe(2);
    });

    it('drops hidden products from the requested cards altogether', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products/cards')
        .query({ ids: [ID.draft, ID.inHiddenCategory, ID.visible].join(',') })
        .expect(200);

      expect((res.body.data as Array<{ id: string }>).map((p) => p.id)).toEqual([ID.visible]);
    });
  });

  describe('POST /api/wishlist — a hidden product cannot be saved (TASK-781)', () => {
    it.each(['items', 'toggle'])('POST /api/wishlist/%s answers 404 for a draft', async (path) => {
      await request(app.getHttpServer())
        .post(`/api/wishlist/${path}`)
        .send({ productId: ID.draft })
        .expect(404);
      expect(prismaServiceMock.wishlistItem.upsert).not.toHaveBeenCalled();
    });
  });
});
