import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CartRepository, CartWithItems } from './cart.repository';
import { CartService } from './cart.service';
import { CartEntity, CartItemEntity } from './entities';
import { AddToCartDto, UpdateCartItemDto } from './dto';
import type { ResolvedCartIdentity } from './cart-identity.types';

// ─── Identities ─────────────────────────────────────────────────────────────

const userIdentity: ResolvedCartIdentity = { type: 'user', userId: 'user-uuid-1' };
const tokenIdentity: ResolvedCartIdentity = { type: 'token', token: 'guest-token-1' };

// ─── Mock data ────────────────────────────────────────────────────────────────

const now = new Date('2026-05-07T12:00:00.000Z');

const mockCartWithVariantItem: CartWithItems = {
  id: 'cart-uuid-1',
  userId: 'user-uuid-1',
  token: null,
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: 'item-uuid-1',
      productId: 'product-uuid-1',
      quantity: 2,
      createdAt: now,
      updatedAt: now,
      product: {
        id: 'product-uuid-1',
        name: 'iPhone 15 Pro Case',
        price: { toString: () => '29.99' } as any,
        compareAtPrice: { toString: () => '39.99' } as any,
        stock: 50,
        isActive: true,
      },
    },
  ],
};

const mockCartWithNoVariantItem: CartWithItems = {
  id: 'cart-uuid-1',
  userId: 'user-uuid-1',
  token: null,
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: 'item-uuid-2',
      productId: 'product-uuid-2',
      quantity: 1,
      createdAt: now,
      updatedAt: now,
      product: {
        id: 'product-uuid-2',
        name: 'Screen Protector',
        price: { toString: () => '9.99' } as any,
        compareAtPrice: null,
        stock: 30,
        isActive: true,
      },
    },
  ],
};

const mockCartWithMultipleItems: CartWithItems = {
  id: 'cart-uuid-1',
  userId: 'user-uuid-1',
  token: null,
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: 'item-uuid-1',
      productId: 'product-uuid-1',
      quantity: 2,
      createdAt: now,
      updatedAt: now,
      product: {
        id: 'product-uuid-1',
        name: 'iPhone 15 Pro Case',
        price: { toString: () => '29.99' } as any,
        compareAtPrice: { toString: () => '39.99' } as any,
        stock: 50,
        isActive: true,
      },
    },
    {
      id: 'item-uuid-2',
      productId: 'product-uuid-2',
      quantity: 1,
      createdAt: now,
      updatedAt: now,
      product: {
        id: 'product-uuid-2',
        name: 'Screen Protector',
        price: { toString: () => '9.99' } as any,
        compareAtPrice: null,
        stock: 30,
        isActive: true,
      },
    },
  ],
};

const mockEmptyCart: CartWithItems = {
  id: 'cart-uuid-1',
  userId: 'user-uuid-1',
  token: null,
  createdAt: now,
  updatedAt: now,
  items: [],
};

const mockCartWithLowStockItem: CartWithItems = {
  id: 'cart-uuid-1',
  userId: 'user-uuid-1',
  token: null,
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: 'item-uuid-3',
      productId: 'product-uuid-3',
      quantity: 1,
      createdAt: now,
      updatedAt: now,
      product: {
        id: 'product-uuid-3',
        name: 'Limited Edition Case — Gold',
        price: { toString: () => '49.99' } as any,
        compareAtPrice: null,
        stock: 2,
        isActive: true,
      },
    },
  ],
};

const mockCartWithInactiveProduct: CartWithItems = {
  id: 'cart-uuid-1',
  userId: 'user-uuid-1',
  token: null,
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: 'item-uuid-4',
      productId: 'product-uuid-4',
      quantity: 1,
      createdAt: now,
      updatedAt: now,
      product: {
        id: 'product-uuid-4',
        name: 'Discontinued Case',
        price: { toString: () => '19.99' } as any,
        compareAtPrice: null,
        stock: 10,
        isActive: false,
      },
    },
  ],
};

// Guest cart used by merge tests — token-based, two items.
const mockGuestCart: CartWithItems = {
  id: 'guest-cart-1',
  userId: null,
  token: 'guest-token-1',
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: 'guest-item-1',
      productId: 'product-uuid-1',
      quantity: 2,
      createdAt: now,
      updatedAt: now,
      product: {
        id: 'product-uuid-1',
        name: 'iPhone 15 Pro Case',
        price: { toString: () => '29.99' } as any,
        compareAtPrice: null,
        stock: 50,
        isActive: true,
      },
    },
    {
      id: 'guest-item-2',
      productId: 'product-uuid-2',
      quantity: 1,
      createdAt: now,
      updatedAt: now,
      product: {
        id: 'product-uuid-2',
        name: 'Screen Protector',
        price: { toString: () => '9.99' } as any,
        compareAtPrice: null,
        stock: 30,
        isActive: true,
      },
    },
  ],
};

// ─── CartRepository mock ────────────────────────────────────────────────────

const cartRepositoryMock = {
  findByUserId: jest.fn(),
  findByToken: jest.fn(),
  findById: jest.fn(),
  findOrCreate: jest.fn(),
  assignCartToUser: jest.fn(),
  mergeGuestCartIntoUser: jest.fn(),
  addItem: jest.fn(),
  updateItem: jest.fn(),
  removeItem: jest.fn(),
  clearItems: jest.fn(),
  findItem: jest.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CartService', () => {
  let service: CartService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CartService, { provide: CartRepository, useValue: cartRepositoryMock }],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  // ─── getCart ─────────────────────────────────────────────────────────────────

  describe('getCart', () => {
    it('should return cart with items and calculated totals', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockCartWithVariantItem);

      const result = await service.getCart(userIdentity);

      expect(result).toBeInstanceOf(CartEntity);
      expect(result.id).toBe('cart-uuid-1');
      expect(result.userId).toBe('user-uuid-1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toBeInstanceOf(CartItemEntity);
      expect(result.totals.subtotal).toBe('59.98'); // 29.99 × 2
      expect(result.totals.itemCount).toBe(2);
      expect(result.totals.uniqueItems).toBe(1);
      expect(cartRepositoryMock.findOrCreate).toHaveBeenCalledWith(userIdentity);
    });

    it('should return empty cart with zero totals when no items', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);

      const result = await service.getCart(userIdentity);

      expect(result.items).toHaveLength(0);
      expect(result.totals.subtotal).toBe('0.00');
      expect(result.totals.itemCount).toBe(0);
      expect(result.totals.uniqueItems).toBe(0);
    });

    it('should calculate totals correctly for multiple items', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockCartWithMultipleItems);

      const result = await service.getCart(userIdentity);

      // 29.99 × 2 (variant item) + 9.99 × 1 (no variant) = 69.97
      expect(result.totals.subtotal).toBe('69.97');
      expect(result.totals.itemCount).toBe(3); // 2 + 1
      expect(result.totals.uniqueItems).toBe(2);
    });

    it('should use product price when no variant exists', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockCartWithNoVariantItem);

      const result = await service.getCart(userIdentity);

      expect(result.items[0].price).toBe('9.99');
      expect(result.items[0].lineTotal).toBe('9.99'); // 9.99 × 1
    });

    it('should use variant price when variant exists', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockCartWithVariantItem);

      const result = await service.getCart(userIdentity);

      expect(result.items[0].price).toBe('29.99');
      expect(result.items[0].lineTotal).toBe('59.98'); // 29.99 × 2
    });

    it('should resolve a guest cart for a token identity', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockGuestCart);

      const result = await service.getCart(tokenIdentity);

      expect(result.userId).toBeNull();
      expect(cartRepositoryMock.findOrCreate).toHaveBeenCalledWith(tokenIdentity);
    });
  });

  // ─── addToCart ───────────────────────────────────────────────────────────────

  describe('addToCart', () => {
    const addDto: AddToCartDto = {
      productId: 'product-uuid-1',
      quantity: 2,
    };

    it('should resolve the cart, add the item, and return the updated cart', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
      cartRepositoryMock.addItem.mockResolvedValue(mockCartWithVariantItem);

      const result = await service.addToCart(userIdentity, addDto);

      expect(result).toBeInstanceOf(CartEntity);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(2);
      expect(cartRepositoryMock.findOrCreate).toHaveBeenCalledWith(userIdentity);
      expect(cartRepositoryMock.addItem).toHaveBeenCalledWith({
        cartId: 'cart-uuid-1',
        productId: 'product-uuid-1',
        quantity: 2,
      });
    });

    it('should work for a guest token identity', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue({ ...mockEmptyCart, id: 'guest-cart-1' });
      cartRepositoryMock.addItem.mockResolvedValue(mockCartWithVariantItem);

      await service.addToCart(tokenIdentity, addDto);

      expect(cartRepositoryMock.findOrCreate).toHaveBeenCalledWith(tokenIdentity);
      expect(cartRepositoryMock.addItem).toHaveBeenCalledWith(
        expect.objectContaining({ cartId: 'guest-cart-1' }),
      );
    });

    it('should throw BadRequestException when adding out-of-stock item', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
      const outOfStockCart: CartWithItems = {
        ...mockEmptyCart,
        items: [
          {
            id: 'item-oos',
            productId: 'product-oos',
            quantity: 1,
            createdAt: now,
            updatedAt: now,
            product: {
              id: 'product-oos',
              name: 'Out of Stock Case',
              price: { toString: () => '19.99' } as any,
              compareAtPrice: null,
              stock: 0,
              isActive: true,
            },
          },
        ],
      };
      cartRepositoryMock.addItem.mockResolvedValue(outOfStockCart);

      await expect(
        service.addToCart(userIdentity, {
          productId: 'product-oos',
          quantity: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when quantity exceeds stock', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
      const lowStockCart: CartWithItems = {
        ...mockCartWithLowStockItem,
        items: [
          {
            ...mockCartWithLowStockItem.items[0],
            quantity: 5, // exceeds stock of 2
          },
        ],
      };
      cartRepositoryMock.addItem.mockResolvedValue(lowStockCart);

      await expect(
        service.addToCart(userIdentity, {
          productId: 'product-uuid-3',
          quantity: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when total quantity exceeds max (99)', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
      const maxQtyCart: CartWithItems = {
        ...mockCartWithVariantItem,
        items: [
          {
            ...mockCartWithVariantItem.items[0],
            quantity: 100, // exceeds max of 99
          },
        ],
      };
      cartRepositoryMock.addItem.mockResolvedValue(maxQtyCart);

      await expect(
        service.addToCart(userIdentity, {
          productId: 'product-uuid-1',
          quantity: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when adding inactive product', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
      cartRepositoryMock.addItem.mockResolvedValue(mockCartWithInactiveProduct);

      await expect(
        service.addToCart(userIdentity, {
          productId: 'product-uuid-4',
          quantity: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should add a position to the cart', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
      cartRepositoryMock.addItem.mockResolvedValue(mockCartWithNoVariantItem);

      const dto: AddToCartDto = {
        productId: 'product-uuid-2',
        quantity: 1,
      };

      const result = await service.addToCart(userIdentity, dto);

      expect(result.items[0].productId).toBe('product-uuid-2');
      expect(cartRepositoryMock.addItem).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'product-uuid-2' }),
      );
    });
  });

  // ─── updateItem ──────────────────────────────────────────────────────────────

  describe('updateItem', () => {
    const updateDto: UpdateCartItemDto = { quantity: 5 };

    it('should update item quantity and return updated cart', async () => {
      const updatedCart: CartWithItems = {
        ...mockCartWithVariantItem,
        items: [{ ...mockCartWithVariantItem.items[0], quantity: 5 }],
      };
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithVariantItem);
      cartRepositoryMock.updateItem.mockResolvedValue({
        id: 'item-uuid-1',
        cartId: 'cart-uuid-1',
        productId: 'product-uuid-1',
        variantId: 'variant-uuid-1',
        quantity: 5,
        createdAt: now,
        updatedAt: now,
      });
      cartRepositoryMock.findOrCreate.mockResolvedValue(updatedCart);

      const result = await service.updateItem(userIdentity, 'item-uuid-1', updateDto);

      expect(result).toBeInstanceOf(CartEntity);
      expect(result.items[0].quantity).toBe(5);
      expect(cartRepositoryMock.updateItem).toHaveBeenCalledWith('item-uuid-1', { quantity: 5 });
    });

    it('should resolve a guest cart by token for update', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue({
        ...mockCartWithVariantItem,
        userId: null,
        token: 'guest-token-1',
      });
      cartRepositoryMock.updateItem.mockResolvedValue({});
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockCartWithVariantItem);

      await service.updateItem(tokenIdentity, 'item-uuid-1', updateDto);

      expect(cartRepositoryMock.findByToken).toHaveBeenCalledWith('guest-token-1');
    });

    it('should throw NotFoundException when item does not exist', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithVariantItem);

      await expect(service.updateItem(userIdentity, 'nonexistent-item', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when quantity exceeds stock', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithLowStockItem);

      await expect(
        service.updateItem(userIdentity, 'item-uuid-3', { quantity: 5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when quantity exceeds max (99)', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithVariantItem);

      await expect(
        service.updateItem(userIdentity, 'item-uuid-1', { quantity: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should remove item when quantity is set to 0', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithVariantItem);
      cartRepositoryMock.removeItem.mockResolvedValue(undefined);
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);

      const result = await service.updateItem(userIdentity, 'item-uuid-1', { quantity: 0 });

      expect(cartRepositoryMock.removeItem).toHaveBeenCalledWith('item-uuid-1');
      expect(result.items).toHaveLength(0);
    });

    it('should throw NotFoundException when cart does not exist', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(null);

      await expect(service.updateItem(userIdentity, 'item-uuid-1', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── removeItem ──────────────────────────────────────────────────────────────

  describe('removeItem', () => {
    it('should remove item and return updated cart', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithMultipleItems);
      cartRepositoryMock.removeItem.mockResolvedValue(undefined);
      const afterRemoval: CartWithItems = {
        ...mockCartWithMultipleItems,
        items: [mockCartWithMultipleItems.items[1]],
      };
      cartRepositoryMock.findOrCreate.mockResolvedValue(afterRemoval);

      const result = await service.removeItem(userIdentity, 'item-uuid-1');

      expect(cartRepositoryMock.removeItem).toHaveBeenCalledWith('item-uuid-1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].productId).toBe('product-uuid-2');
    });

    it('should throw NotFoundException when item not in cart', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithVariantItem);

      await expect(service.removeItem(userIdentity, 'nonexistent-item')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when cart does not exist', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(null);

      await expect(service.removeItem(userIdentity, 'item-uuid-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── clearCart ───────────────────────────────────────────────────────────────

  describe('clearCart', () => {
    it('should clear all items and return empty cart', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithMultipleItems);
      cartRepositoryMock.clearItems.mockResolvedValue(undefined);
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);

      const result = await service.clearCart(userIdentity);

      expect(cartRepositoryMock.clearItems).toHaveBeenCalledWith('cart-uuid-1');
      expect(result.items).toHaveLength(0);
      expect(result.totals.subtotal).toBe('0.00');
    });

    it('should throw NotFoundException when cart does not exist', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(null);

      await expect(service.clearCart(userIdentity)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── mergeGuestCart ──────────────────────────────────────────────────────────

  describe('mergeGuestCart', () => {
    it('should be a no-op when the guest cart does not exist', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue(null);

      await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

      expect(cartRepositoryMock.findByUserId).not.toHaveBeenCalled();
      expect(cartRepositoryMock.assignCartToUser).not.toHaveBeenCalled();
      expect(cartRepositoryMock.mergeGuestCartIntoUser).not.toHaveBeenCalled();
    });

    it('should be a no-op when the guest cart is empty', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue({
        ...mockEmptyCart,
        userId: null,
        token: 'guest-token-1',
      });

      await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

      expect(cartRepositoryMock.assignCartToUser).not.toHaveBeenCalled();
      expect(cartRepositoryMock.mergeGuestCartIntoUser).not.toHaveBeenCalled();
    });

    it('should reassign the guest cart when the user has no existing cart', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue(mockGuestCart);
      cartRepositoryMock.findByUserId.mockResolvedValue(null);
      cartRepositoryMock.assignCartToUser.mockResolvedValue(true);

      await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

      expect(cartRepositoryMock.assignCartToUser).toHaveBeenCalledWith(
        'guest-cart-1',
        'user-uuid-1',
      );
      expect(cartRepositoryMock.mergeGuestCartIntoUser).not.toHaveBeenCalled();
    });

    it('should fall back to merging into a concurrently-created user cart when the reassign hits a unique conflict', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue(mockGuestCart);
      // First lookup: no user cart. assignCartToUser reports a conflict (false).
      // Re-lookup then finds the cart created by the concurrent request.
      cartRepositoryMock.findByUserId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...mockEmptyCart, id: 'user-cart-raced', items: [] });
      cartRepositoryMock.assignCartToUser.mockResolvedValue(false);

      await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

      expect(cartRepositoryMock.assignCartToUser).toHaveBeenCalledWith(
        'guest-cart-1',
        'user-uuid-1',
      );
      // Guest items are merged into the raced user cart instead of being lost.
      expect(cartRepositoryMock.mergeGuestCartIntoUser).toHaveBeenCalledWith({
        userCartId: 'user-cart-raced',
        guestCartId: 'guest-cart-1',
        lines: [
          { productId: 'product-uuid-1', quantity: 2 },
          { productId: 'product-uuid-2', quantity: 1 },
        ],
      });
    });

    it('should merge non-overlapping items into the user cart atomically with their original quantities', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue(mockGuestCart);
      // User cart has a different product (no overlap with guest items).
      cartRepositoryMock.findByUserId.mockResolvedValue({
        ...mockEmptyCart,
        id: 'user-cart-1',
        items: [],
      });

      await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

      // Both guest lines handed to the transactional merge in one call,
      // each with its original quantity; the guest cart id is deleted there.
      expect(cartRepositoryMock.mergeGuestCartIntoUser).toHaveBeenCalledWith({
        userCartId: 'user-cart-1',
        guestCartId: 'guest-cart-1',
        lines: [
          { productId: 'product-uuid-1', quantity: 2 },
          { productId: 'product-uuid-2', quantity: 1 },
        ],
      });
    });

    it('should sum overlapping quantities and clamp to MAX_QUANTITY (99)', async () => {
      // Guest has the position (qty 15); user already has 90. Stock is ample so
      // the MAX_QUANTITY clamp (not stock) is what bites.
      const amplyStocked = {
        ...mockGuestCart.items[1],
        quantity: 15,
        product: { ...mockGuestCart.items[1].product, stock: 200 },
      };
      cartRepositoryMock.findByToken.mockResolvedValue({
        ...mockGuestCart,
        items: [amplyStocked],
      });
      cartRepositoryMock.findByUserId.mockResolvedValue({
        ...mockEmptyCart,
        id: 'user-cart-1',
        items: [
          {
            ...mockCartWithNoVariantItem.items[0],
            id: 'user-item-x',
            quantity: 90,
          },
        ],
      });

      await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

      // 90 + 15 = 105 → clamped to 99
      expect(cartRepositoryMock.mergeGuestCartIntoUser).toHaveBeenCalledWith({
        userCartId: 'user-cart-1',
        guestCartId: 'guest-cart-1',
        lines: [{ productId: 'product-uuid-2', quantity: 99 }],
      });
    });

    it('should clamp the merged quantity to variant stock', async () => {
      // Guest item is a variant with stock 2; summed quantity would exceed it.
      cartRepositoryMock.findByToken.mockResolvedValue({
        ...mockGuestCart,
        items: [
          {
            ...mockCartWithLowStockItem.items[0], // variant stock 2
            quantity: 1,
          },
        ],
      });
      cartRepositoryMock.findByUserId.mockResolvedValue({
        ...mockEmptyCart,
        id: 'user-cart-1',
        items: [
          {
            ...mockCartWithLowStockItem.items[0],
            id: 'user-item-low',
            quantity: 2,
          },
        ],
      });

      await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

      // 2 + 1 = 3 → clamped to stock 2
      expect(cartRepositoryMock.mergeGuestCartIntoUser).toHaveBeenCalledWith({
        userCartId: 'user-cart-1',
        guestCartId: 'guest-cart-1',
        lines: [{ productId: 'product-uuid-3', quantity: 2 }],
      });
    });

    it('should merge overlapping and new lines together while dropping lines clamped to zero stock', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue({
        ...mockGuestCart,
        items: [
          // Overlapping item: guest 1 + user 2 → 3
          { ...mockGuestCart.items[1], quantity: 1 },
          // Brand-new position (stock 50): copied as-is
          { ...mockCartWithVariantItem.items[0], id: 'guest-new', quantity: 2 },
          // Out-of-stock position: clamps to 0 and must be dropped entirely
          {
            ...mockCartWithLowStockItem.items[0],
            id: 'guest-oos',
            quantity: 3,
            product: { ...mockCartWithLowStockItem.items[0].product, stock: 0 },
          },
        ],
      });
      cartRepositoryMock.findByUserId.mockResolvedValue({
        ...mockEmptyCart,
        id: 'user-cart-1',
        items: [{ ...mockCartWithNoVariantItem.items[0], id: 'user-item-x', quantity: 2 }],
      });

      await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

      // Only the two viable lines are written; the zero-stock line is filtered out.
      expect(cartRepositoryMock.mergeGuestCartIntoUser).toHaveBeenCalledWith({
        userCartId: 'user-cart-1',
        guestCartId: 'guest-cart-1',
        lines: [
          { productId: 'product-uuid-2', quantity: 3 },
          { productId: 'product-uuid-1', quantity: 2 },
        ],
      });
    });
  });

  // ─── Total calculation edge cases ────────────────────────────────────────────

  describe('total calculation', () => {
    it('should handle items with price having zero cents (e.g., 10.00)', async () => {
      const cartWithWholePrice: CartWithItems = {
        id: 'cart-uuid-1',
        userId: 'user-uuid-1',
        token: null,
        createdAt: now,
        updatedAt: now,
        items: [
          {
            id: 'item-whole',
            productId: 'product-whole',
            quantity: 3,
            createdAt: now,
            updatedAt: now,
            product: {
              id: 'product-whole',
              name: 'Cable',
              price: { toString: () => '10.00' } as any,
              compareAtPrice: null,
              stock: 100,
              isActive: true,
            },
          },
        ],
      };
      cartRepositoryMock.findOrCreate.mockResolvedValue(cartWithWholePrice);

      const result = await service.getCart(userIdentity);

      expect(result.totals.subtotal).toBe('30.00');
      expect(result.items[0].lineTotal).toBe('30.00');
    });

    it('should handle single item with quantity 1', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockCartWithNoVariantItem);

      const result = await service.getCart(userIdentity);

      expect(result.totals.subtotal).toBe('9.99');
      expect(result.totals.itemCount).toBe(1);
      expect(result.totals.uniqueItems).toBe(1);
    });

    it('should use the position price for line totals', async () => {
      const cartWithPosition: CartWithItems = {
        id: 'cart-uuid-1',
        userId: 'user-uuid-1',
        token: null,
        createdAt: now,
        updatedAt: now,
        items: [
          {
            id: 'item-diff-price',
            productId: 'product-diff',
            quantity: 1,
            createdAt: now,
            updatedAt: now,
            product: {
              id: 'product-diff',
              name: 'Premium Case — Limited Edition',
              price: { toString: () => '49.99' } as any,
              compareAtPrice: null,
              stock: 10,
              isActive: true,
            },
          },
        ],
      };
      cartRepositoryMock.findOrCreate.mockResolvedValue(cartWithPosition);

      const result = await service.getCart(userIdentity);

      expect(result.items[0].price).toBe('49.99');
      expect(result.totals.subtotal).toBe('49.99');
    });
  });
});
