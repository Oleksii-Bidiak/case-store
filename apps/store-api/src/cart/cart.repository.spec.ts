import { CartRepository, AddToCartInput, CartWithItems } from './cart.repository';
import { PrismaService } from '../prisma';

// ─── Mock PrismaService ──────────────────────────────────────────────────────

const prismaMock = {
  cart: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  cartItem: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ─── Test data ────────────────────────────────────────────────────────────────

const mockCartWithItems: CartWithItems = {
  id: 'cart-uuid-1',
  userId: 'user-uuid-1',
  token: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [
    {
      id: 'item-uuid-1',
      productId: 'product-uuid-1',
      variantId: 'variant-uuid-1',
      quantity: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      product: {
        id: 'product-uuid-1',
        name: 'iPhone 15 Pro Case',
        price: { toString: () => '29.99' } as any,
        compareAtPrice: { toString: () => '39.99' } as any,
        isActive: true,
      },
      variant: {
        id: 'variant-uuid-1',
        name: 'Black / iPhone 15 Pro',
        price: { toString: () => '29.99' } as any,
        stock: 50,
        isActive: true,
      },
    },
    {
      id: 'item-uuid-2',
      productId: 'product-uuid-2',
      variantId: null,
      quantity: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      product: {
        id: 'product-uuid-2',
        name: 'Screen Protector',
        price: { toString: () => '9.99' } as any,
        compareAtPrice: null,
        isActive: true,
      },
      variant: null,
    },
  ],
};

const emptyCart: CartWithItems = {
  id: 'cart-uuid-1',
  userId: 'user-uuid-1',
  token: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [],
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('CartRepository', () => {
  let repository: CartRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new CartRepository(prismaMock as unknown as PrismaService);
  });

  // ─── findByUserId ────────────────────────────────────────────────────────────

  describe('findByUserId', () => {
    it('should return cart with items when found', async () => {
      prismaMock.cart.findUnique.mockResolvedValue(mockCartWithItems);

      const result = await repository.findByUserId('user-uuid-1');

      expect(result).toEqual(mockCartWithItems);
      expect(prismaMock.cart.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1' },
        include: expect.objectContaining({ items: expect.any(Object) }),
      });
    });

    it('should return null when user has no cart', async () => {
      prismaMock.cart.findUnique.mockResolvedValue(null);

      const result = await repository.findByUserId('nonexistent-user');

      expect(result).toBeNull();
    });
  });

  // ─── findById ────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return cart with items when found', async () => {
      prismaMock.cart.findUnique.mockResolvedValue(mockCartWithItems);

      const result = await repository.findById('cart-uuid-1');

      expect(result).toEqual(mockCartWithItems);
      expect(prismaMock.cart.findUnique).toHaveBeenCalledWith({
        where: { id: 'cart-uuid-1' },
        include: expect.objectContaining({ items: expect.any(Object) }),
      });
    });

    it('should return null when cart not found', async () => {
      prismaMock.cart.findUnique.mockResolvedValue(null);

      const result = await repository.findById('nonexistent-cart');

      expect(result).toBeNull();
    });
  });

  // ─── findOrCreate ────────────────────────────────────────────────────────────

  describe('findByToken', () => {
    it('should look up a cart by its guest token', async () => {
      prismaMock.cart.findUnique.mockResolvedValue(mockCartWithItems);

      const result = await repository.findByToken('guest-token-1');

      expect(result).toEqual(mockCartWithItems);
      expect(prismaMock.cart.findUnique).toHaveBeenCalledWith({
        where: { token: 'guest-token-1' },
        include: expect.objectContaining({ items: expect.any(Object) }),
      });
    });
  });

  describe('findOrCreate', () => {
    it('should upsert by userId for a user identity', async () => {
      prismaMock.cart.upsert.mockResolvedValue(mockCartWithItems);

      const result = await repository.findOrCreate({ type: 'user', userId: 'user-uuid-1' });

      expect(result).toEqual(mockCartWithItems);
      expect(prismaMock.cart.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1' },
        update: {},
        create: { userId: 'user-uuid-1' },
        include: expect.objectContaining({ items: expect.any(Object) }),
      });
    });

    it('should upsert by token for a guest identity', async () => {
      prismaMock.cart.upsert.mockResolvedValue(emptyCart);

      const result = await repository.findOrCreate({ type: 'token', token: 'guest-token-1' });

      expect(result).toEqual(emptyCart);
      expect(prismaMock.cart.upsert).toHaveBeenCalledWith({
        where: { token: 'guest-token-1' },
        update: {},
        create: { token: 'guest-token-1' },
        include: expect.objectContaining({ items: expect.any(Object) }),
      });
    });
  });

  // ─── addItem ─────────────────────────────────────────────────────────────────

  describe('addItem', () => {
    const input: AddToCartInput = {
      cartId: 'cart-uuid-1',
      productId: 'product-uuid-1',
      variantId: 'variant-uuid-1',
      quantity: 2,
    };

    const makeTx = (existing: { id: string } | null, cart: unknown) => ({
      cart: { findUnique: jest.fn().mockResolvedValue(cart) },
      cartItem: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    it('should use a transaction to ensure atomicity', async () => {
      const txMock = makeTx(null, mockCartWithItems);
      prismaMock.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) =>
        cb(txMock),
      );

      await repository.addItem(input);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should create a new line then return the full cart when the item does not exist', async () => {
      const txMock = makeTx(null, mockCartWithItems);
      prismaMock.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) =>
        cb(txMock),
      );

      const result = await repository.addItem(input);

      // The line is resolved with a null-safe findFirst filter, not a unique where.
      expect(txMock.cartItem.findFirst).toHaveBeenCalledWith({
        where: { cartId: 'cart-uuid-1', productId: 'product-uuid-1', variantId: 'variant-uuid-1' },
        select: { id: true },
      });
      expect(txMock.cartItem.create).toHaveBeenCalledWith({
        data: {
          cartId: 'cart-uuid-1',
          productId: 'product-uuid-1',
          variantId: 'variant-uuid-1',
          quantity: 2,
        },
      });
      expect(txMock.cart.findUnique).toHaveBeenCalledWith({
        where: { id: 'cart-uuid-1' },
        include: expect.objectContaining({ items: expect.any(Object) }),
      });
      expect(result).toEqual(mockCartWithItems);
    });

    it('should increment the existing line quantity when the item already exists', async () => {
      const txMock = makeTx({ id: 'item-uuid-1' }, mockCartWithItems);
      prismaMock.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) =>
        cb(txMock),
      );

      await repository.addItem(input);

      expect(txMock.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'item-uuid-1' },
        data: { quantity: { increment: 2 } },
      });
      expect(txMock.cartItem.create).not.toHaveBeenCalled();
    });

    it('should resolve a null variantId via a findFirst filter, not a null unique selector', async () => {
      const inputNoVariant: AddToCartInput = {
        cartId: 'cart-uuid-1',
        productId: 'product-uuid-2',
        variantId: undefined,
        quantity: 1,
      };
      const txMock = makeTx(null, emptyCart);
      prismaMock.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) =>
        cb(txMock),
      );

      await repository.addItem(inputNoVariant);

      expect(txMock.cartItem.findFirst).toHaveBeenCalledWith({
        where: { cartId: 'cart-uuid-1', productId: 'product-uuid-2', variantId: null },
        select: { id: true },
      });
      expect(txMock.cartItem.create).toHaveBeenCalledWith({
        data: { cartId: 'cart-uuid-1', productId: 'product-uuid-2', variantId: null, quantity: 1 },
      });
    });
  });

  // ─── updateItem ──────────────────────────────────────────────────────────────

  describe('updateItem', () => {
    it('should update item quantity and return the updated record', async () => {
      const updatedItem = {
        id: 'item-uuid-1',
        cartId: 'cart-uuid-1',
        productId: 'product-uuid-1',
        variantId: 'variant-uuid-1',
        quantity: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.cartItem.update.mockResolvedValue(updatedItem);

      const result = await repository.updateItem('item-uuid-1', { quantity: 5 });

      expect(result).toEqual(updatedItem);
      expect(prismaMock.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'item-uuid-1' },
        data: { quantity: 5 },
      });
    });
  });

  // ─── removeItem ──────────────────────────────────────────────────────────────

  describe('removeItem', () => {
    it('should delete the cart item by ID', async () => {
      prismaMock.cartItem.delete.mockResolvedValue({});

      await repository.removeItem('item-uuid-1');

      expect(prismaMock.cartItem.delete).toHaveBeenCalledWith({
        where: { id: 'item-uuid-1' },
      });
    });
  });

  // ─── clearItems ──────────────────────────────────────────────────────────────

  describe('clearItems', () => {
    it('should delete all items in the cart', async () => {
      prismaMock.cartItem.deleteMany.mockResolvedValue({ count: 3 });

      await repository.clearItems('cart-uuid-1');

      expect(prismaMock.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cartId: 'cart-uuid-1' },
      });
    });
  });

  // ─── findItem ────────────────────────────────────────────────────────────────

  describe('findItem', () => {
    it('should find a cart item by cart, product, and variant ID', async () => {
      const existingItem = {
        id: 'item-uuid-1',
        cartId: 'cart-uuid-1',
        productId: 'product-uuid-1',
        variantId: 'variant-uuid-1',
        quantity: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.cartItem.findUnique.mockResolvedValue(existingItem);

      const result = await repository.findItem('cart-uuid-1', 'product-uuid-1', 'variant-uuid-1');

      expect(result).toEqual(existingItem);
      expect(prismaMock.cartItem.findUnique).toHaveBeenCalledWith({
        where: {
          cartId_productId_variantId: {
            cartId: 'cart-uuid-1',
            productId: 'product-uuid-1',
            variantId: 'variant-uuid-1',
          },
        },
      });
    });

    it('should find a cart item without variant', async () => {
      const existingItem = {
        id: 'item-uuid-2',
        cartId: 'cart-uuid-1',
        productId: 'product-uuid-2',
        variantId: null,
        quantity: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.cartItem.findUnique.mockResolvedValue(existingItem);

      const result = await repository.findItem('cart-uuid-1', 'product-uuid-2');

      expect(result).toEqual(existingItem);
      expect(prismaMock.cartItem.findUnique).toHaveBeenCalledWith({
        where: {
          cartId_productId_variantId: {
            cartId: 'cart-uuid-1',
            productId: 'product-uuid-2',
            variantId: null,
          },
        },
      });
    });

    it('should return null when item not found', async () => {
      prismaMock.cartItem.findUnique.mockResolvedValue(null);

      const result = await repository.findItem('cart-uuid-1', 'nonexistent-product');

      expect(result).toBeNull();
    });
  });
});
