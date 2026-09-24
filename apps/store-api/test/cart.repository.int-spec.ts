import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { PinoLogger } from 'nestjs-pino';
import { CartRepository } from '../src/cart/cart.repository';
import { CartService } from '../src/cart/cart.service';
import { GuestCartCleanupService } from '../src/cart/guest-cart-cleanup.service';
import { GUEST_CART_EMPTY_RETENTION_MS } from '../src/cart/cart.constants';
import { AddonApplicabilityResolver } from '../src/addon-service';
import { PrismaService } from '../src/prisma';

/**
 * Integration tests for CartRepository — run the REAL repository against a
 * REAL Postgres instance (no mocks). These exercise the dual-identity DB paths
 * that the mocked e2e suites cannot: token/user upserts, the unique `token`
 * column, `assignCartToUser` (token → null + the P2002 conflict path), and the
 * `mergeGuestCartIntoUser` transaction — including that it ROLLS BACK on
 * failure (the guarantee behind TASK-051-K that mocks can't prove).
 *
 * Requires an isolated `*_test` database; DATABASE_URL is forced to it by
 * setup-int.ts. Run with `npm run test:int -w apps/store-api` from the repo
 * root (DB must be up with the current schema pushed — `npx prisma db push`
 * against the test DB; see docs/manual-qa-pending.md §1 / CI test-int job).
 */
describe('CartRepository (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: CartRepository;
  let service: CartService;

  // Fixtures (real rows the cart items reference via FK).
  let userId: string;
  let productId: string;
  let product2Id: string;
  let categoryId: string;

  const MISSING_PRODUCT_ID = '00000000-0000-0000-0000-000000000000';

  beforeAll(async () => {
    // Hard safety net: never run destructive integration tests against a
    // database that is not clearly a test database.
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
        // No add-on catalogue here — the cart's DB behaviour is what is under test.
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
    await app.init(); // triggers PrismaService.onModuleInit ($connect)

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(CartRepository);
    service = moduleRef.get(CartService);

    const suffix = randomUUID();
    const category = await prisma.category.create({
      data: { name: 'Int Category', slug: `int-cat-${suffix}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: { name: 'Int Product', slug: `int-prod-${suffix}`, price: '29.99', categoryId },
    });
    productId = product.id;

    const product2 = await prisma.product.create({
      data: { name: 'Int Product 2', slug: `int-prod2-${suffix}`, price: '9.99', categoryId },
    });
    product2Id = product2.id;

    const user = await prisma.user.create({
      data: { email: `int-${suffix}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;
  });

  // Each test starts from a clean cart table (cascade removes cart items).
  afterEach(async () => {
    await prisma.cart.deleteMany({});
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.cart.deleteMany({});
    await prisma.product.deleteMany({ where: { id: { in: [productId, product2Id] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  // ─── findOrCreate ─────────────────────────────────────────────────────────

  it('findOrCreate({type:token}) creates a guest cart and is idempotent for the same token', async () => {
    const token = `tok-${randomUUID()}`;

    const first = await repo.findOrCreate({ type: 'token', token });
    expect(first.userId).toBeNull();
    expect(first.token).toBe(token);

    const second = await repo.findOrCreate({ type: 'token', token });
    expect(second.id).toBe(first.id);
  });

  it('findOrCreate({type:user}) creates a user cart with no token', async () => {
    const cart = await repo.findOrCreate({ type: 'user', userId });
    expect(cart.userId).toBe(userId);
    expect(cart.token).toBeNull();
  });

  it('findByToken returns the guest cart for a known token and null for an unknown one', async () => {
    const token = `tok-${randomUUID()}`;
    await repo.findOrCreate({ type: 'token', token });

    expect(await repo.findByToken(token)).not.toBeNull();
    expect(await repo.findByToken(`missing-${randomUUID()}`)).toBeNull();
  });

  // ─── Reads never write; empty guest carts are swept (TASK-776) ──────────────

  it('getCart for a guest without a cart leaves the carts table untouched', async () => {
    const token = `tok-${randomUUID()}`;
    const before = await prisma.cart.count();

    const cart = await service.getCart({ type: 'token', token });
    await service.getCart({ type: 'token', token });

    expect(cart.items).toEqual([]);
    expect(await prisma.cart.count()).toBe(before);
    expect(await repo.findByToken(token)).toBeNull();
  });

  it('the cleanup deletes only EMPTY GUEST carts last touched before the retention window', async () => {
    const stale = new Date(Date.now() - GUEST_CART_EMPTY_RETENTION_MS - 60 * 60 * 1000);

    const emptyOld = await repo.findOrCreate({ type: 'token', token: `tok-${randomUUID()}` });
    const emptyFresh = await repo.findOrCreate({ type: 'token', token: `tok-${randomUUID()}` });
    const filledOld = await repo.findOrCreate({ type: 'token', token: `tok-${randomUUID()}` });
    await repo.addItem({ cartId: filledOld.id, productId, quantity: 1 });
    const userEmptyOld = await repo.findOrCreate({ type: 'user', userId });

    await prisma.cart.updateMany({
      where: { id: { in: [emptyOld.id, filledOld.id, userEmptyOld.id] } },
      data: { updatedAt: stale },
    });
    const before = await prisma.cart.count();

    const logger = { setContext: () => undefined, info: () => undefined } as unknown as PinoLogger;
    const cleanup = new GuestCartCleanupService(
      repo,
      { get: () => 'false' } as never,
      new SchedulerRegistry(),
      logger,
    );
    const deleted = await cleanup.purgeStaleEmptyGuestCarts();

    expect(deleted).toBe(1);
    expect(await prisma.cart.count()).toBe(before - 1);
    const survivors = await prisma.cart.findMany({ select: { id: true } });
    const ids = survivors.map((row) => row.id);
    expect(ids).not.toContain(emptyOld.id);
    expect(ids).toEqual(expect.arrayContaining([emptyFresh.id, filledOld.id, userEmptyOld.id]));
  });

  it('findOrCreate touches updatedAt of an existing cart, so a cart being added to is never swept', async () => {
    const token = `tok-${randomUUID()}`;
    const cart = await repo.findOrCreate({ type: 'token', token });
    const stale = new Date(Date.now() - GUEST_CART_EMPTY_RETENTION_MS - 60 * 60 * 1000);
    await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: stale } });

    const touched = await repo.findOrCreate({ type: 'token', token });

    expect(touched.id).toBe(cart.id);
    expect(touched.updatedAt.getTime()).toBeGreaterThan(stale.getTime());
    expect(
      await repo.deleteStaleEmptyGuestCarts(new Date(Date.now() - GUEST_CART_EMPTY_RETENTION_MS)),
    ).toBe(0);
  });

  // ─── addItem ────────────────────────────────────────────────────────────────

  it('addItem creates the line then increments it on the same product', async () => {
    const cart = await repo.findOrCreate({ type: 'token', token: `tok-${randomUUID()}` });

    await repo.addItem({ cartId: cart.id, productId, quantity: 2 });
    let updated = await repo.findById(cart.id);
    expect(updated?.items).toHaveLength(1);
    expect(updated?.items[0].quantity).toBe(2);

    await repo.addItem({ cartId: cart.id, productId, quantity: 3 });
    updated = await repo.findById(cart.id);
    expect(updated?.items).toHaveLength(1);
    expect(updated?.items[0].quantity).toBe(5);
  });

  // ─── assignCartToUser ─────────────────────────────────────────────────────

  it('assignCartToUser reassigns the guest cart to the user, clearing the token, and returns true', async () => {
    const guest = await repo.findOrCreate({ type: 'token', token: `tok-${randomUUID()}` });

    const assigned = await repo.assignCartToUser(guest.id, userId);
    expect(assigned).toBe(true);

    const byUser = await repo.findByUserId(userId);
    expect(byUser?.id).toBe(guest.id);
    expect(byUser?.userId).toBe(userId);
    expect(byUser?.token).toBeNull();
  });

  it('assignCartToUser returns false (P2002) when the user already owns a cart, leaving the guest cart intact', async () => {
    await repo.findOrCreate({ type: 'user', userId }); // pre-existing user cart
    const token = `tok-${randomUUID()}`;
    const guest = await repo.findOrCreate({ type: 'token', token });

    const assigned = await repo.assignCartToUser(guest.id, userId);
    expect(assigned).toBe(false);

    // The guest cart was NOT reassigned and still exists under its token.
    expect(await repo.findByToken(token)).not.toBeNull();
  });

  // ─── mergeGuestCartIntoUser (transaction) ───────────────────────────────────

  it('mergeGuestCartIntoUser upserts the lines and deletes the guest cart atomically', async () => {
    const userCart = await repo.findOrCreate({ type: 'user', userId });
    const token = `tok-${randomUUID()}`;
    const guest = await repo.findOrCreate({ type: 'token', token });

    await repo.mergeGuestCartIntoUser({
      userCartId: userCart.id,
      guestCartId: guest.id,
      lines: [
        // `addonServiceIds` is the line's FINAL add-on selection (TASK-174) — the
        // service always resolves one before calling, so an empty set is the
        // "no add-ons chosen" case, not an omission.
        { productId, quantity: 4, addonServiceIds: [] },
        { productId: product2Id, quantity: 1, addonServiceIds: [] },
      ],
    });

    const merged = await repo.findById(userCart.id);
    expect(merged?.items).toHaveLength(2);
    const productLine = merged?.items.find((i) => i.productId === productId);
    expect(productLine?.quantity).toBe(4);

    // The guest cart is gone.
    expect(await repo.findByToken(token)).toBeNull();
  });

  it('mergeGuestCartIntoUser ROLLS BACK on a mid-transaction failure (no partial merge, guest cart kept)', async () => {
    const userCart = await repo.findOrCreate({ type: 'user', userId });
    // Pre-existing user line so we can prove it is untouched after rollback.
    await repo.addItem({ cartId: userCart.id, productId, quantity: 1 });

    const token = `tok-${randomUUID()}`;
    const guest = await repo.findOrCreate({ type: 'token', token });

    await expect(
      repo.mergeGuestCartIntoUser({
        userCartId: userCart.id,
        guestCartId: guest.id,
        lines: [
          { productId: product2Id, quantity: 2 }, // valid line
          { productId: MISSING_PRODUCT_ID, quantity: 1 }, // FK violation
        ],
      }),
    ).rejects.toThrow();

    // Transaction rolled back: the valid line was NOT written and the guest
    // cart was NOT deleted.
    const after = await repo.findById(userCart.id);
    expect(after?.items).toHaveLength(1);
    expect(after?.items[0].productId).toBe(productId);
    expect(await repo.findByToken(token)).not.toBeNull();
  });
});
