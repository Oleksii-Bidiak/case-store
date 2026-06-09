import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CartRepository, CartWithItems } from './cart.repository';
import { CartService } from './cart.service';
import { CartEntity, CartItemEntity } from './entities';
import { AddToCartDto, UpdateCartItemDto } from './dto';

// ─── Mock data ────────────────────────────────────────────────────────────────

const now = new Date('2026-05-07T12:00:00.000Z');

const mockCartWithVariantItem: CartWithItems = {
  id: 'cart-uuid-1',
  userId: 'user-uuid-1',
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: 'item-uuid-1',
      productId: 'product-uuid-1',
      variantId: 'variant-uuid-1',
      quantity: 2,
      createdAt: now,
      updatedAt: now,
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
  ],
};

const mockCartWithNoVariantItem: CartWithItems = {
  id: 'cart-uuid-1',
  userId: 'user-uuid-1',
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: 'item-uuid-2',
      productId: 'product-uuid-2',
      variantId: null,
      quantity: 1,
      createdAt: now,
      updatedAt: now,
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

const mockCartWithMultipleItems: CartWithItems = {
  id: 'cart-uuid-1',
  userId: 'user-uuid-1',
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: 'item-uuid-1',
      productId: 'product-uuid-1',
      variantId: 'variant-uuid-1',
      quantity: 2,
      createdAt: now,
      updatedAt: now,
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
      createdAt: now,
      updatedAt: now,
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

const mockEmptyCart: CartWithItems = {
  id: 'cart-uuid-1',
  userId: 'user-uuid-1',
  createdAt: now,
  updatedAt: now,
  items: [],
};

const mockCartWithLowStockItem: CartWithItems = {
  id: 'cart-uuid-1',
  userId: 'user-uuid-1',
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: 'item-uuid-3',
      productId: 'product-uuid-3',
      variantId: 'variant-uuid-3',
      quantity: 1,
      createdAt: now,
      updatedAt: now,
      product: {
        id: 'product-uuid-3',
        name: 'Limited Edition Case',
        price: { toString: () => '49.99' } as any,
        compareAtPrice: null,
        isActive: true,
      },
      variant: {
        id: 'variant-uuid-3',
        name: 'Gold / iPhone 15 Pro',
        price: { toString: () => '49.99' } as any,
        stock: 2,
        isActive: true,
      },
    },
  ],
};

const mockCartWithInactiveProduct: CartWithItems = {
  id: 'cart-uuid-1',
  userId: 'user-uuid-1',
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: 'item-uuid-4',
      productId: 'product-uuid-4',
      variantId: null,
      quantity: 1,
      createdAt: now,
      updatedAt: now,
      product: {
        id: 'product-uuid-4',
        name: 'Discontinued Case',
        price: { toString: () => '19.99' } as any,
        compareAtPrice: null,
        isActive: false,
      },
      variant: null,
    },
  ],
};

// ─── CartRepository mock ────────────────────────────────────────────────────

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

      const result = await service.getCart('user-uuid-1');

      expect(result).toBeInstanceOf(CartEntity);
      expect(result.id).toBe('cart-uuid-1');
      expect(result.userId).toBe('user-uuid-1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toBeInstanceOf(CartItemEntity);
      expect(result.totals.subtotal).toBe('59.98'); // 29.99 × 2
      expect(result.totals.itemCount).toBe(2);
      expect(result.totals.uniqueItems).toBe(1);
      expect(cartRepositoryMock.findOrCreate).toHaveBeenCalledWith('user-uuid-1');
    });

    it('should return empty cart with zero totals when no items', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);

      const result = await service.getCart('user-uuid-1');

      expect(result.items).toHaveLength(0);
      expect(result.totals.subtotal).toBe('0.00');
      expect(result.totals.itemCount).toBe(0);
      expect(result.totals.uniqueItems).toBe(0);
    });

    it('should calculate totals correctly for multiple items', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockCartWithMultipleItems);

      const result = await service.getCart('user-uuid-1');

      // 29.99 × 2 (variant item) + 9.99 × 1 (no variant) = 69.97
      expect(result.totals.subtotal).toBe('69.97');
      expect(result.totals.itemCount).toBe(3); // 2 + 1
      expect(result.totals.uniqueItems).toBe(2);
    });

    it('should use product price when no variant exists', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockCartWithNoVariantItem);

      const result = await service.getCart('user-uuid-1');

      expect(result.items[0].price).toBe('9.99');
      expect(result.items[0].lineTotal).toBe('9.99'); // 9.99 × 1
    });

    it('should use variant price when variant exists', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockCartWithVariantItem);

      const result = await service.getCart('user-uuid-1');

      expect(result.items[0].price).toBe('29.99');
      expect(result.items[0].lineTotal).toBe('59.98'); // 29.99 × 2
    });
  });

  // ─── addToCart ───────────────────────────────────────────────────────────────

  describe('addToCart', () => {
    const addDto: AddToCartDto = {
      productId: 'product-uuid-1',
      variantId: 'variant-uuid-1',
      quantity: 2,
    };

    it('should add a new item to cart and return updated cart', async () => {
      cartRepositoryMock.addItem.mockResolvedValue(mockCartWithVariantItem);

      const result = await service.addToCart('user-uuid-1', addDto);

      expect(result).toBeInstanceOf(CartEntity);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(2);
      expect(cartRepositoryMock.addItem).toHaveBeenCalledWith({
        userId: 'user-uuid-1',
        productId: 'product-uuid-1',
        variantId: 'variant-uuid-1',
        quantity: 2,
      });
    });

    it('should increment quantity when adding same product+variant', async () => {
      const incrementedCart: CartWithItems = {
        ...mockCartWithVariantItem,
        items: [{ ...mockCartWithVariantItem.items[0], quantity: 4 }],
      };
      cartRepositoryMock.addItem.mockResolvedValue(incrementedCart);

      const result = await service.addToCart('user-uuid-1', addDto);

      expect(result.items[0].quantity).toBe(4);
      // Repository handles the increment via upsert
      expect(cartRepositoryMock.addItem).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 2 }),
      );
    });

    it('should throw BadRequestException when adding out-of-stock item', async () => {
      // addItem returns a cart where the variant has stock = 0
      const outOfStockCart: CartWithItems = {
        ...mockEmptyCart,
        items: [
          {
            id: 'item-oos',
            productId: 'product-oos',
            variantId: 'variant-oos',
            quantity: 1,
            createdAt: now,
            updatedAt: now,
            product: {
              id: 'product-oos',
              name: 'Out of Stock Case',
              price: { toString: () => '19.99' } as any,
              compareAtPrice: null,
              isActive: true,
            },
            variant: {
              id: 'variant-oos',
              name: 'Red / iPhone 15',
              price: { toString: () => '19.99' } as any,
              stock: 0,
              isActive: true,
            },
          },
        ],
      };
      cartRepositoryMock.addItem.mockResolvedValue(outOfStockCart);

      await expect(
        service.addToCart('user-uuid-1', {
          productId: 'product-oos',
          variantId: 'variant-oos',
          quantity: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when quantity exceeds stock', async () => {
      // Adding quantity=5 but variant only has stock=2
      cartRepositoryMock.addItem.mockResolvedValue(mockCartWithLowStockItem);

      // The cart shows quantity=1 but we're trying to add more
      // The service should validate that the resulting quantity doesn't exceed stock
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
        service.addToCart('user-uuid-1', {
          productId: 'product-uuid-3',
          variantId: 'variant-uuid-3',
          quantity: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when total quantity exceeds max (99)', async () => {
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
        service.addToCart('user-uuid-1', {
          productId: 'product-uuid-1',
          variantId: 'variant-uuid-1',
          quantity: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when adding inactive product', async () => {
      cartRepositoryMock.addItem.mockResolvedValue(mockCartWithInactiveProduct);

      await expect(
        service.addToCart('user-uuid-1', {
          productId: 'product-uuid-4',
          quantity: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should add item without variant (variantId undefined)', async () => {
      cartRepositoryMock.addItem.mockResolvedValue(mockCartWithNoVariantItem);

      const dtoNoVariant: AddToCartDto = {
        productId: 'product-uuid-2',
        quantity: 1,
      };

      const result = await service.addToCart('user-uuid-1', dtoNoVariant);

      expect(result.items[0].variantId).toBeNull();
      expect(cartRepositoryMock.addItem).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: undefined }),
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
      // Initial lookup uses findByUserId (for validation)
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
      // getCart() at the end uses findOrCreate
      cartRepositoryMock.findOrCreate.mockResolvedValue(updatedCart);

      const result = await service.updateItem('user-uuid-1', 'item-uuid-1', updateDto);

      expect(result).toBeInstanceOf(CartEntity);
      expect(result.items[0].quantity).toBe(5);
      expect(cartRepositoryMock.updateItem).toHaveBeenCalledWith('item-uuid-1', { quantity: 5 });
    });

    it('should throw NotFoundException when item does not exist', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithVariantItem);

      // The item ID is not in the user's cart
      await expect(
        service.updateItem('user-uuid-1', 'nonexistent-item', updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when item belongs to another user', async () => {
      // User's cart doesn't contain the specified item —
      // since we only look in the user's own cart, an item from
      // another cart is simply "not found"
      const otherUserCart: CartWithItems = {
        ...mockCartWithVariantItem,
        userId: 'user-uuid-1',
      };
      cartRepositoryMock.findByUserId.mockResolvedValue(otherUserCart);

      // The item-uuid-1 is in user-uuid-1's cart, but we're looking for an item
      // that belongs to a different cart — it won't be found
      await expect(
        service.updateItem('user-uuid-1', 'item-from-other-cart', updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when quantity exceeds stock', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithLowStockItem);

      // Trying to update to quantity=5 but stock=2
      await expect(
        service.updateItem('user-uuid-1', 'item-uuid-3', { quantity: 5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when quantity exceeds max (99)', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithVariantItem);

      await expect(
        service.updateItem('user-uuid-1', 'item-uuid-1', { quantity: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should remove item when quantity is set to 0', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithVariantItem);
      cartRepositoryMock.removeItem.mockResolvedValue(undefined);
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);

      const result = await service.updateItem('user-uuid-1', 'item-uuid-1', { quantity: 0 });

      expect(cartRepositoryMock.removeItem).toHaveBeenCalledWith('item-uuid-1');
      expect(result.items).toHaveLength(0);
    });

    it('should throw NotFoundException when user has no cart', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(null);

      await expect(service.updateItem('user-uuid-1', 'item-uuid-1', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── removeItem ──────────────────────────────────────────────────────────────

  describe('removeItem', () => {
    it('should remove item and return updated cart', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithMultipleItems);
      cartRepositoryMock.removeItem.mockResolvedValue(undefined);
      // After removal, cart has only the screen protector
      const afterRemoval: CartWithItems = {
        ...mockCartWithMultipleItems,
        items: [mockCartWithMultipleItems.items[1]],
      };
      cartRepositoryMock.findOrCreate.mockResolvedValue(afterRemoval);

      const result = await service.removeItem('user-uuid-1', 'item-uuid-1');

      expect(cartRepositoryMock.removeItem).toHaveBeenCalledWith('item-uuid-1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].productId).toBe('product-uuid-2');
    });

    it('should throw NotFoundException when item not in user cart', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithVariantItem);

      await expect(service.removeItem('user-uuid-1', 'nonexistent-item')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when user has no cart', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(null);

      await expect(service.removeItem('user-uuid-1', 'item-uuid-1')).rejects.toThrow(
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

      const result = await service.clearCart('user-uuid-1');

      expect(cartRepositoryMock.clearItems).toHaveBeenCalledWith('cart-uuid-1');
      expect(result.items).toHaveLength(0);
      expect(result.totals.subtotal).toBe('0.00');
      expect(result.totals.itemCount).toBe(0);
      expect(result.totals.uniqueItems).toBe(0);
    });

    it('should throw NotFoundException when user has no cart', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(null);

      await expect(service.clearCart('user-uuid-1')).rejects.toThrow(NotFoundException);
    });

    it('should return empty cart even if cart was already empty', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockEmptyCart);
      cartRepositoryMock.clearItems.mockResolvedValue(undefined);
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);

      const result = await service.clearCart('user-uuid-1');

      expect(result.items).toHaveLength(0);
      expect(result.totals.subtotal).toBe('0.00');
    });
  });

  // ─── Total calculation edge cases ────────────────────────────────────────────

  describe('total calculation', () => {
    it('should handle items with price having zero cents (e.g., 10.00)', async () => {
      const cartWithWholePrice: CartWithItems = {
        id: 'cart-uuid-1',
        userId: 'user-uuid-1',
        createdAt: now,
        updatedAt: now,
        items: [
          {
            id: 'item-whole',
            productId: 'product-whole',
            variantId: null,
            quantity: 3,
            createdAt: now,
            updatedAt: now,
            product: {
              id: 'product-whole',
              name: 'Cable',
              price: { toString: () => '10.00' } as any,
              compareAtPrice: null,
              isActive: true,
            },
            variant: null,
          },
        ],
      };
      cartRepositoryMock.findOrCreate.mockResolvedValue(cartWithWholePrice);

      const result = await service.getCart('user-uuid-1');

      expect(result.totals.subtotal).toBe('30.00');
      expect(result.items[0].lineTotal).toBe('30.00');
    });

    it('should handle single item with quantity 1', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockCartWithNoVariantItem);

      const result = await service.getCart('user-uuid-1');

      expect(result.totals.subtotal).toBe('9.99');
      expect(result.totals.itemCount).toBe(1);
      expect(result.totals.uniqueItems).toBe(1);
    });

    it('should handle variant price different from product price', async () => {
      const cartWithDifferentVariantPrice: CartWithItems = {
        id: 'cart-uuid-1',
        userId: 'user-uuid-1',
        createdAt: now,
        updatedAt: now,
        items: [
          {
            id: 'item-diff-price',
            productId: 'product-diff',
            variantId: 'variant-diff',
            quantity: 1,
            createdAt: now,
            updatedAt: now,
            product: {
              id: 'product-diff',
              name: 'Premium Case',
              price: { toString: () => '29.99' } as any, // product price
              compareAtPrice: null,
              isActive: true,
            },
            variant: {
              id: 'variant-diff',
              name: 'Limited Edition',
              price: { toString: () => '49.99' } as any, // variant price (higher)
              stock: 10,
              isActive: true,
            },
          },
        ],
      };
      cartRepositoryMock.findOrCreate.mockResolvedValue(cartWithDifferentVariantPrice);

      const result = await service.getCart('user-uuid-1');

      // Should use variant price (49.99), not product price (29.99)
      expect(result.items[0].price).toBe('49.99');
      expect(result.totals.subtotal).toBe('49.99');
    });
  });
});
