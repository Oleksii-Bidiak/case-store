import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { AuditRepository } from '../src/audit/audit.repository';
import { PrismaService } from '../src/prisma';
import { PRODUCT_DELETE_AUDIT } from '../src/product/product.constants';
import { ProductRepository } from '../src/product/product.repository';
import { SlugRedirectRepository } from '../src/slug-redirect';

/**
 * The admin «Видалені» list against a REAL Postgres (TASK-1830): ordered by the real
 * `deletedAt` (not `updatedAt`, which a later stock return can move), and «who deleted
 * it» read from the action log — the newest `product.remove` per product, with the
 * actor's current name.
 *
 * Requires an isolated `*_test` database; DATABASE_URL is forced to it by setup-int.ts.
 */
describe('Admin deleted-products list (integration, TASK-1830)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let products: ProductRepository;
  let audit: AuditRepository;

  const s = randomUUID().slice(0, 8);
  let categoryId: string;
  const productIds: string[] = [];
  const userIds: string[] = [];
  const auditIds: string[] = [];

  const makeTombstone = async (name: string, deletedAt: Date, updatedAt: Date) => {
    const row = await prisma.product.create({
      data: {
        name: `dl ${name}`,
        slug: `deleted:x:dl-${name}-${s}`,
        price: '9.99',
        stock: 1,
        categoryId,
        isActive: false,
        deletedAt,
      },
    });
    productIds.push(row.id);
    // `@updatedAt` is client-set on every write — pin it with a raw statement.
    await prisma.$executeRaw`UPDATE products SET updated_at = ${updatedAt} WHERE id = ${row.id}`;
    return row.id;
  };

  const logDelete = async (productId: string, actorId: string | null, at: Date) => {
    const row = await prisma.auditLog.create({
      data: {
        action: PRODUCT_DELETE_AUDIT.action,
        entityType: PRODUCT_DELETE_AUDIT.entityType,
        entityId: productId,
        actorId,
        actorEmail: actorId ? `${actorId}@log.test` : null,
        createdAt: at,
      },
    });
    auditIds.push(row.id);
  };

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, SlugRedirectRepository, ProductRepository, AuditRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    products = moduleRef.get(ProductRepository);
    audit = moduleRef.get(AuditRepository);

    categoryId = (await prisma.category.create({ data: { name: 'dl cat', slug: `dl-cat-${s}` } }))
      .id;
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.auditLog.deleteMany({ where: { id: { in: auditIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    await app.close();
  });

  it('orders the deleted list by deletedAt, whatever updatedAt says', async () => {
    // Deleted first, but touched last (a cancelled order returned its stock).
    const early = await makeTombstone(
      'early',
      new Date('2026-09-01T10:00:00.000Z'),
      new Date('2026-09-30T10:00:00.000Z'),
    );
    const late = await makeTombstone(
      'late',
      new Date('2026-09-20T10:00:00.000Z'),
      new Date('2026-09-20T10:00:00.000Z'),
    );

    const { products: page } = await products.findAll({
      page: 1,
      limit: 20,
      deleted: true,
      categoryIds: [categoryId],
      sortBy: 'deletedAt',
      sortOrder: 'desc',
    });

    const ours = page.filter((row) => row.id === early || row.id === late).map((row) => row.id);
    expect(ours).toEqual([late, early]);
  });

  it('names the actor of the NEWEST product.remove per product, from the real tables', async () => {
    const olena = await prisma.user.create({
      data: {
        email: `olena-${s}@dl.test`,
        firstName: 'Олена',
        lastName: 'Коваль',
        role: 'MANAGER',
      },
    });
    userIds.push(olena.id);
    const gone = `gone-${s}`; // an actor whose account no longer exists

    const twice = await makeTombstone('twice', new Date('2026-09-10'), new Date('2026-09-10'));
    const systemOnly = await makeTombstone(
      'system',
      new Date('2026-09-11'),
      new Date('2026-09-11'),
    );
    // Deleted, restored, deleted again: the second delete is the one shown.
    await logDelete(twice, gone, new Date('2026-09-01T10:00:00.000Z'));
    await logDelete(twice, olena.id, new Date('2026-09-10T10:00:00.000Z'));
    await logDelete(systemOnly, null, new Date('2026-09-11T10:00:00.000Z'));

    const actors = await audit.findLatestActors(
      PRODUCT_DELETE_AUDIT.action,
      PRODUCT_DELETE_AUDIT.entityType,
      [twice, systemOnly],
    );

    expect(actors.get(twice)).toEqual({
      actorId: olena.id,
      actorEmail: `${olena.id}@log.test`,
      firstName: 'Олена',
      lastName: 'Коваль',
    });
    expect(actors.has(systemOnly)).toBe(false);
  });
});
