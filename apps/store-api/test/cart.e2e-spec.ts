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
import { CartRepository, CartWithItems } from '../src/cart/cart.repository';
import { PrismaService } from '../src/prisma';

/**
 * E2E tests for the Cart module.
 *
 * Every cart endpoint requires JwtAuthGuard, so the suite mints JWT tokens
 * directly via JwtService (bypassing the rate-limited auth endpoints) and
 * mocks CartRepository — the clean-architecture boundary — so no real
 * database is needed. AuthRepository, UserRepository, and PrismaService are
 * also mocked to let AppModule bootstrap without a DB connection.
 *
 * ThrottlerGuard is overridden with a pass-through guard to disable rate
 * limiting during test execution.
 */

// Pass-through guard that allows all requests (disables rate limiting in tests)
class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('CartController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // Valid v4 UUIDs for request bodies (AddToCartDto enforces @IsUUID(4))
  const VALID_PRODUCT_UUID = '550e8400-e29b-41d4-a716-446655440000';

  // Mock CartRepository — clean architecture boundary
  const cartRepositoryMock = {
    findByUserId: jest.fn(),
    findById: jest.fn(),
    findOrCreate: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    removeItem: jest.fn(),
    clearItems: jest.fn(),
    findItem: jest.fn(),
  };

  // Mock AuthRepository — for JWT strategy user lookup
  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
  };

  // Mock UserRepository — for user management
  const userRepositoryMock = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
  };

  // Mock PrismaService — prevents database connection errors
  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  // ─── Test data ──────────────────────────────────────────────────────────────

  const userA = { id: 'user-a-e2e-1', role: 'CUSTOMER' as const };
  const userB = { id: 'user-b-e2e-1', role: 'CUSTOMER' as const };

  const testProduct = {
    id: 'prod-e2e-1',
    name: 'iPhone 15 Pro Case — Clear MagSafe',
    price: { toString: () => '29.99' },
    compareAtPrice: null,
    isActive: true,
  };

  const testCartItem = {
    id: 'item-e2e-1',
    productId: 'prod-e2e-1',
    variantId: null,
    quantity: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    product: testProduct,
    variant: null,
  };

  const testCartItemWithVariant = {
    id: 'item-e2e-2',
    productId: 'prod-e2e-1',
    variantId: 'var-e2e-1',
    quantity: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    product: testProduct,
    variant: {
      id: 'var-e2e-1',
      name: 'Black',
      price: { toString: () => '34.99' },
      stock: 5,
      isActive: true,
    },
  };

  // A variant item whose quantity (10) exceeds its stock (5)
  const testOutOfStockCartItem = {
    ...testCartItemWithVariant,
    quantity: 10,
  };

  const makeCartWithItems = (
    userId: string,
    items: CartWithItems['items'] = [testCartItem],
  ): CartWithItems => ({
    id: 'cart-e2e-1',
    userId,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    items,
  });

  const emptyCart = (userId: string): CartWithItems => makeCartWithItems(userId, []);

  /**
   * Generate a JWT access token for a given user ID and role.
   * Bypasses the rate-limited auth register endpoint.
   */
  function generateAccessToken(userId: string, role: string): string {
    return jwtService.sign(
      { sub: userId, role },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      },
    );
  }

  /**
   * Assert that a response body matches the cart envelope + entity shape.
   */
  function expectCartShape(body: Record<string, unknown>): void {
    expect(body).toHaveProperty('data');
    const data = body.data as Record<string, unknown>;
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('items');
    expect(data).toHaveProperty('totals');
    const totals = data.totals as Record<string, unknown>;
    expect(totals).toHaveProperty('subtotal');
    expect(totals).toHaveProperty('itemCount');
    expect(totals).toHaveProperty('uniqueItems');
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env'],
        }),
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
      .overrideProvider(CartRepository)
      .useValue(cartRepositoryMock)
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
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    app.setGlobalPrefix('api', {
      exclude: ['health'],
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Reset mocks between tests (resetAllMocks clears implementations too)
  afterEach(() => {
    jest.resetAllMocks();
  });

  // ─── GET /api/cart ────────────────────────────────────────────────────────

  describe('GET /api/cart', () => {
    it('should return 200 with an empty cart when no items exist', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      cartRepositoryMock.findOrCreate.mockResolvedValue(emptyCart(userA.id));

      const response = await request(app.getHttpServer())
        .get('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expectCartShape(response.body);
      expect(response.body.data.userId).toBe(userA.id);
      expect(response.body.data.items).toHaveLength(0);
      expect(response.body.data.totals).toEqual({
        subtotal: '0.00',
        itemCount: 0,
        uniqueItems: 0,
      });
    });
  });

  // ─── POST /api/cart/items ───────────────────────────────────────────────────

  describe('POST /api/cart/items', () => {
    it('should add an item to the cart and return 201 with the updated cart', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      cartRepositoryMock.addItem.mockResolvedValue(makeCartWithItems(userA.id));

      const response = await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: VALID_PRODUCT_UUID, quantity: 1 })
        .expect(201);

      expectCartShape(response.body);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].quantity).toBe(1);
      expect(response.body.data.totals.itemCount).toBe(1);
    });

    it('should increment quantity when the same product+variant is added again', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      // Repository upsert has already incremented the quantity to 2
      cartRepositoryMock.addItem.mockResolvedValue(
        makeCartWithItems(userA.id, [{ ...testCartItem, quantity: 2 }]),
      );

      const response = await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: VALID_PRODUCT_UUID, quantity: 1 })
        .expect(201);

      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].quantity).toBe(2);
      expect(response.body.data.totals.itemCount).toBe(2);
    });

    it('should return 400 when the item quantity exceeds the variant stock', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      cartRepositoryMock.addItem.mockResolvedValue(
        makeCartWithItems(userA.id, [testOutOfStockCartItem]),
      );

      await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: VALID_PRODUCT_UUID, quantity: 10 })
        .expect(400);
    });

    it('should return 400 when the requested quantity exceeds the max (99)', async () => {
      const token = generateAccessToken(userA.id, userA.role);

      await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: VALID_PRODUCT_UUID, quantity: 100 })
        .expect(400);

      // Validation fires before the service, so the repository is never touched
      expect(cartRepositoryMock.addItem).not.toHaveBeenCalled();
    });

    it('should return 400 when productId is not a valid UUID', async () => {
      const token = generateAccessToken(userA.id, userA.role);

      await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: 'not-a-uuid', quantity: 1 })
        .expect(400);
    });
  });

  // ─── PATCH /api/cart/items/:itemId ──────────────────────────────────────────

  describe('PATCH /api/cart/items/:itemId', () => {
    it('should update the item quantity and return 200 with the updated cart', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      const updatedCart = makeCartWithItems(userA.id, [{ ...testCartItem, quantity: 3 }]);

      cartRepositoryMock.findByUserId.mockResolvedValue(makeCartWithItems(userA.id));
      cartRepositoryMock.updateItem.mockResolvedValue({ ...testCartItem, quantity: 3 });
      cartRepositoryMock.findOrCreate.mockResolvedValue(updatedCart);

      const response = await request(app.getHttpServer())
        .patch('/api/cart/items/item-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 3 })
        .expect(200);

      expectCartShape(response.body);
      expect(response.body.data.items[0].quantity).toBe(3);
      expect(cartRepositoryMock.updateItem).toHaveBeenCalledWith('item-e2e-1', { quantity: 3 });
    });

    it('should return 400 when quantity is 0 (blocked by DTO @Min(1))', async () => {
      const token = generateAccessToken(userA.id, userA.role);

      await request(app.getHttpServer())
        .patch('/api/cart/items/item-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 0 })
        .expect(400);
    });

    it('should return 404 when the item does not exist in the cart', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      cartRepositoryMock.findByUserId.mockResolvedValue(emptyCart(userA.id));

      await request(app.getHttpServer())
        .patch('/api/cart/items/nonexistent-item')
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 2 })
        .expect(404);
    });
  });

  // ─── DELETE /api/cart/items/:itemId ─────────────────────────────────────────

  describe('DELETE /api/cart/items/:itemId', () => {
    it('should remove an item and return 200 with the updated cart', async () => {
      const token = generateAccessToken(userA.id, userA.role);

      cartRepositoryMock.findByUserId.mockResolvedValue(makeCartWithItems(userA.id));
      cartRepositoryMock.removeItem.mockResolvedValue(undefined);
      cartRepositoryMock.findOrCreate.mockResolvedValue(emptyCart(userA.id));

      const response = await request(app.getHttpServer())
        .delete('/api/cart/items/item-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expectCartShape(response.body);
      expect(response.body.data.items).toHaveLength(0);
      expect(cartRepositoryMock.removeItem).toHaveBeenCalledWith('item-e2e-1');
    });

    it("should return 404 when user B tries to remove user A's item (IDOR)", async () => {
      const token = generateAccessToken(userB.id, userB.role);
      // User B's cart does not contain item-e2e-1
      cartRepositoryMock.findByUserId.mockResolvedValue(emptyCart(userB.id));

      await request(app.getHttpServer())
        .delete('/api/cart/items/item-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      // The item must never be deleted on behalf of a non-owner
      expect(cartRepositoryMock.removeItem).not.toHaveBeenCalled();
    });
  });

  // ─── DELETE /api/cart ─────────────────────────────────────────────────────

  describe('DELETE /api/cart', () => {
    it('should clear all items and return 200 with an empty cart', async () => {
      const token = generateAccessToken(userA.id, userA.role);

      cartRepositoryMock.findByUserId.mockResolvedValue(makeCartWithItems(userA.id));
      cartRepositoryMock.clearItems.mockResolvedValue(undefined);
      cartRepositoryMock.findOrCreate.mockResolvedValue(emptyCart(userA.id));

      const response = await request(app.getHttpServer())
        .delete('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expectCartShape(response.body);
      expect(response.body.data.items).toHaveLength(0);
      expect(response.body.data.totals.itemCount).toBe(0);
      expect(cartRepositoryMock.clearItems).toHaveBeenCalledWith('cart-e2e-1');
    });
  });

  // ─── Authentication guard ─────────────────────────────────────────────────

  describe('Authentication', () => {
    it('should return 401 for every endpoint when no Authorization header is provided', async () => {
      const server = app.getHttpServer();

      await request(server).get('/api/cart').expect(401);
      await request(server)
        .post('/api/cart/items')
        .send({ productId: VALID_PRODUCT_UUID, quantity: 1 })
        .expect(401);
      await request(server).patch('/api/cart/items/item-e2e-1').send({ quantity: 2 }).expect(401);
      await request(server).delete('/api/cart/items/item-e2e-1').expect(401);
      await request(server).delete('/api/cart').expect(401);
    });
  });
});
