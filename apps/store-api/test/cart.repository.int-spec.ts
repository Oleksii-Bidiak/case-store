import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { CartRepository } from '../src/cart/cart.repository';
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
 * setup-int.ts. Run with `npm run test:int -w apps/store-api` (DB must be up
 * and migrated — see docs/manual-qa-phase2.md / CI test-int job).
 */
describe('CartRepository (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: CartRepository;

  // Fixtures (real rows the cart items reference via FK).
  let userId: string;
  let productId: string;
  let variantId: string;
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
      providers: [PrismaService, CartRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init(); // triggers PrismaService.onModuleInit ($connect)

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(CartRepository);

    const suffix = randomUUID();
    const category = await prisma.category.create({
      data: { name: 'Int Category', slug: `int-cat-${suffix}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: { name: 'Int Product', slug: `int-prod-${suffix}`, price: '29.99', categoryId },
    });
    productId = product.id;

    const variant = await prisma.productVariant.create({
      data: { productId, name: 'Black', price: '29.99', stock: 50 },
    });
    variantId = variant.id;

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
    await prisma.productVariant.deleteMany({ where: { productId } });
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

  // ─── addItem ────────────────────────────────────────────────────────────────

  it('addItem creates the line then increments it on the same product+variant', async () => {
    const cart = await repo.findOrCreate({ type: 'token', token: `tok-${randomUUID()}` });

    await repo.addItem({ cartId: cart.id, productId, variantId, quantity: 2 });
    let updated = await repo.findById(cart.id);
    expect(updated?.items).toHaveLength(1);
    expect(updated?.items[0].quantity).toBe(2);

    await repo.addItem({ cartId: cart.id, productId, variantId, quantity: 3 });
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
        { productId, variantId, quantity: 4 },
        { productId: product2Id, variantId: null, quantity: 1 },
      ],
    });

    const merged = await repo.findById(userCart.id);
    expect(merged?.items).toHaveLength(2);
    const variantLine = merged?.items.find((i) => i.variantId === variantId);
    expect(variantLine?.quantity).toBe(4);

    // The guest cart is gone.
    expect(await repo.findByToken(token)).toBeNull();
  });

  it('mergeGuestCartIntoUser ROLLS BACK on a mid-transaction failure (no partial merge, guest cart kept)', async () => {
    const userCart = await repo.findOrCreate({ type: 'user', userId });
    // Pre-existing user line so we can prove it is untouched after rollback.
    await repo.addItem({ cartId: userCart.id, productId, variantId, quantity: 1 });

    const token = `tok-${randomUUID()}`;
    const guest = await repo.findOrCreate({ type: 'token', token });

    await expect(
      repo.mergeGuestCartIntoUser({
        userCartId: userCart.id,
        guestCartId: guest.id,
        lines: [
          { productId: product2Id, variantId: null, quantity: 2 }, // valid line
          { productId: MISSING_PRODUCT_ID, variantId: null, quantity: 1 }, // FK violation
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
