import { BadRequestException, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { CartRepository } from '../src/cart/cart.repository';
import { CartService } from '../src/cart/cart.service';
import type { ResolvedCartIdentity } from '../src/cart/cart-identity.types';
import { AddonApplicabilityResolver } from '../src/addon-service';
import { PrismaService } from '../src/prisma';

/**
 * TASK-779 — `addToCart` must be atomic on a REAL Postgres.
 *
 * The bug: the stock check read the line, then a separate write incremented it.
 * Two requests racing on `stock = 1` both read "0 in the cart", both passed, both
 * incremented — 2 units in the cart, `maxQty` saying 1, and a checkout that
 * refused the shopper with no way to fix it from the stepper.
 *
 * A mocked unit test cannot see this: the race lives between the read and the
 * write, so the only honest proof is concurrent requests against a database
 * that actually commits in between. Five parallel adds of one unit at stock 1
 * must leave exactly ONE unit in the cart, and the other four must be refused
 * with a 400.
 */
describe('CartService.addToCart — concurrency (integration, TASK-779)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: CartService;

  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        CartRepository,
        CartService,
        {
          provide: AddonApplicabilityResolver,
          useValue: {
            resolveForProducts: () => Promise.resolve(new Map()),
            resolveForProduct: () => Promise.resolve([]),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(CartService);

    const suffix = randomUUID();
    const category = await prisma.category.create({
      data: { name: 'Concurrency Category', slug: `conc-cat-${suffix}`, isActive: true },
    });
    categoryId = category.id;

    // The fixture sets stock EXPLICITLY — the whole test is about this number.
    const product = await prisma.product.create({
      data: {
        name: 'Last Unit',
        slug: `conc-prod-${suffix}`,
        price: '19.99',
        stock: 1,
        isActive: true,
        categoryId,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.cartItem.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await app.close();
  });

  afterEach(async () => {
    await prisma.cartItem.deleteMany({ where: { productId } });
  });

  async function raceAdds(identity: ResolvedCartIdentity, attempts: number) {
    return Promise.allSettled(
      Array.from({ length: attempts }, () =>
        service.addToCart(identity, { productId, quantity: 1 }),
      ),
    );
  }

  it('five parallel adds at stock=1 into an EXISTING line leave exactly 1 unit; the rest are 400', async () => {
    const identity: ResolvedCartIdentity = { type: 'token', token: `conc-${randomUUID()}` };
    // Nothing in the cart yet, but the cart row exists — the race is on the line.
    await service.addToCart(identity, { productId, quantity: 1 });
    await prisma.cartItem.deleteMany({ where: { productId } });

    const results = await raceAdds(identity, 5);

    const line = await prisma.cartItem.findFirst({
      where: { productId, cart: { token: identity.token } },
    });
    expect(line?.quantity).toBe(1);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(4);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(BadRequestException);
    }
  });

  it('five parallel adds at stock=1 on top of a line already holding 1 add nothing; all are 400', async () => {
    const identity: ResolvedCartIdentity = { type: 'token', token: `conc-${randomUUID()}` };
    await service.addToCart(identity, { productId, quantity: 1 });

    const results = await raceAdds(identity, 5);

    const line = await prisma.cartItem.findFirst({
      where: { productId, cart: { token: identity.token } },
    });
    expect(line?.quantity).toBe(1);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
  });

  // The same gap on PATCH: `updateItem` checked the quantity against the cart it
  // had read BEFORE the write, then wrote with a bare update. Stock that shrank
  // in between (a checkout, an admin edit) slipped through. The cart read below is
  // made stale on purpose — it still says stock 5 while the database says 1 — so
  // only a check inside the write, on a fresh product, can refuse it.
  it('a quantity update checks the FRESH stock inside the write, not the cart it read before', async () => {
    const identity: ResolvedCartIdentity = { type: 'token', token: `conc-${randomUUID()}` };
    await service.addToCart(identity, { productId, quantity: 1 });

    const repository = app.get(CartRepository);
    const staleCart = await repository.findByToken(identity.token);
    const staleLine = staleCart!.items[0];
    const findByToken = jest.spyOn(repository, 'findByToken').mockResolvedValueOnce({
      ...staleCart!,
      items: [{ ...staleLine, product: { ...staleLine.product, stock: 5 } }],
    });

    try {
      await expect(service.updateItem(identity, staleLine.id, { quantity: 3 })).rejects.toThrow(
        BadRequestException,
      );
    } finally {
      findByToken.mockRestore();
    }

    const line = await prisma.cartItem.findUnique({ where: { id: staleLine.id } });
    expect(line?.quantity).toBe(1);
  });
});
