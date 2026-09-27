import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * «Тільки в наявності» on the public listing (TASK-830, SF-CAT-13).
 *
 * The bug lived in the REPOSITORY, between two individually-correct pieces: the
 * shared where-builder turned `?inStock=true` into `stock: { gt: 0 }`, and the
 * public listing's «sold-out last» partitioning (TASK-362) then rebuilt its tail
 * as `{ ...where, stock: { lte: 0 } }` — replacing the filter instead of
 * narrowing it. Any page short of a full in-stock page was topped up with
 * sold-out products, so the checkbox visibly changed nothing.
 *
 * A mock of `ProductRepository` cannot see that, so the REAL repository runs
 * here over a fake PrismaService that EVALUATES the `where`, `skip` and `take`
 * it is handed (the TASK-781 visibility suite's approach). An operator it does
 * not know throws, so the fake cannot pass silently on a clause it ignores.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

// `deletedAt` is part of the public visibility rule since the category tombstone
// (TASK-653): the fake evaluates `category: { isActive, deletedAt: null }` literally.
const CATEGORY = {
  id: 'cat-cases',
  name: 'Чохли',
  slug: 'chokhly',
  isActive: true,
  deletedAt: null,
};

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
  groupId: null;
  brandId: null;
  attributes: Record<string, string>;
  isActive: boolean;
  deletedAt: Date | null;
  metaTitle: null;
  metaDescription: null;
  keywords: string[];
  ogImage: null;
  createdAt: Date;
  updatedAt: Date;
  category: typeof CATEGORY;
};

function row(slug: string, stock: number, day: number): Row {
  return {
    id: `id-${slug}`,
    name: `Товар ${slug}`,
    slug,
    description: null,
    price: { toString: () => '500' },
    compareAtPrice: null,
    sku: null,
    stock,
    categoryId: CATEGORY.id,
    groupId: null,
    brandId: null,
    attributes: {},
    isActive: true,
    deletedAt: null,
    metaTitle: null,
    metaDescription: null,
    keywords: [],
    ogImage: null,
    // Newest first is the default sort — the sold-out rows are the NEWEST, so an
    // unpartitioned page would even lead with them.
    createdAt: new Date(Date.UTC(2026, 0, day)),
    updatedAt: new Date(Date.UTC(2026, 0, day)),
    category: CATEGORY,
  };
}

/** Three positions on sale, two sold out. */
const ROWS: Row[] = [
  row('in-a', 4, 1),
  row('in-b', 1, 2),
  row('in-c', 12, 3),
  row('sold-out-a', 0, 4),
  row('sold-out-b', 0, 5),
];
const IN_STOCK = ['in-a', 'in-b', 'in-c'];
const SOLD_OUT = ['sold-out-a', 'sold-out-b'];

function matchesCondition(key: string, value: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== 'object' || cond instanceof Date) {
    if (!['isActive', 'deletedAt', 'categoryId'].includes(key)) {
      throw new Error(`fake prisma: unsupported key "${key}"`);
    }
    return value === cond;
  }
  const ops = cond as Record<string, unknown>;
  return Object.entries(ops).every(([op, operand]) => {
    if (key === 'stock' && op === 'gt') return (value as number) > (operand as number);
    if (key === 'stock' && op === 'lte') return (value as number) <= (operand as number);
    if (op === 'in') return (operand as unknown[]).includes(value);
    throw new Error(`fake prisma: unsupported condition on "${key}": ${JSON.stringify(cond)}`);
  });
}

function matches(target: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'category') {
      return matches(target.category as Record<string, unknown>, cond as Record<string, unknown>);
    }
    return matchesCondition(key, target[key], cond);
  });
}

type FindArgs = {
  where?: Record<string, unknown>;
  skip?: number;
  take?: number;
};

function select(args: FindArgs): Row[] {
  // The listing orders newest first with an id tiebreaker; mirror it so paging
  // is deterministic.
  const found = ROWS.filter((r) => matches(r, args.where)).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const start = args.skip ?? 0;
  return found.slice(start, args.take === undefined ? undefined : start + args.take);
}

describe('GET /api/products?inStock=true (e2e, TASK-830)', () => {
  let app: INestApplication;

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    product: {
      findMany: jest.fn(async (args: FindArgs) => select(args).map((r) => ({ ...r, brand: null }))),
      count: jest.fn(async (args: FindArgs) => select({ where: args.where }).length),
    },
    productImage: { findMany: jest.fn(async () => []) },
    review: { groupBy: jest.fn(async () => []) },
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
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    app = moduleFixture.createNestApplication();
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

  const slugsOf = (body: { data: Array<{ slug: string }> }) => body.data.map((p) => p.slug);

  it('without the filter lists everything, sold-out positions last', async () => {
    const res = await request(app.getHttpServer()).get('/api/products').expect(200);

    expect(res.body.meta.total).toBe(5);
    expect(slugsOf(res.body)).toEqual(['in-c', 'in-b', 'in-a', ...SOLD_OUT.slice().reverse()]);
  });

  it('with inStock=true drops the sold-out positions from the page AND the count', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/products')
      .query({ inStock: 'true' })
      .expect(200);

    expect(res.body.meta.total).toBe(3);
    expect(slugsOf(res.body).sort()).toEqual(IN_STOCK);
    for (const product of res.body.data as Array<{ inStock: boolean }>) {
      expect(product.inStock).toBe(true);
    }
  });

  it('keeps sold-out positions off every later page too', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/products')
      .query({ inStock: 'true', limit: 2, page: 2 })
      .expect(200);

    expect(res.body.meta.total).toBe(3);
    expect(slugsOf(res.body)).toEqual(['in-a']);
  });

  it('reads inStock=false as «no availability filter», not as true', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/products')
      .query({ inStock: 'false' })
      .expect(200);

    expect(res.body.meta.total).toBe(5);
  });
});
