import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CartRepository, CartWithItems } from './cart.repository';
import { CartService } from './cart.service';
import { CartEntity, CartItemEntity } from './entities';
import { AddToCartDto, UpdateCartItemDto } from './dto';
import type { ResolvedCartIdentity } from './cart-identity.types';
import { AddonApplicabilityResolver } from '../addon-service';

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
      addons: [],
      product: {
        id: 'product-uuid-1',
        name: 'iPhone 15 Pro Case',
        price: { toString: () => '29.99' } as any,
        compareAtPrice: { toString: () => '39.99' } as any,
        stock: 50,
        isActive: true,
        slug: 'test-product',
        categoryId: 'cat-1',
        category: { isActive: true },
        images: [],
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
      addons: [],
      product: {
        id: 'product-uuid-2',
        name: 'Screen Protector',
        price: { toString: () => '9.99' } as any,
        compareAtPrice: null,
        stock: 30,
        isActive: true,
        slug: 'test-product',
        categoryId: 'cat-1',
        category: { isActive: true },
        images: [],
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
      addons: [],
      product: {
        id: 'product-uuid-1',
        name: 'iPhone 15 Pro Case',
        price: { toString: () => '29.99' } as any,
        compareAtPrice: { toString: () => '39.99' } as any,
        stock: 50,
        isActive: true,
        slug: 'test-product',
        categoryId: 'cat-1',
        category: { isActive: true },
        images: [],
      },
    },
    {
      id: 'item-uuid-2',
      productId: 'product-uuid-2',
      quantity: 1,
      createdAt: now,
      updatedAt: now,
      addons: [],
      product: {
        id: 'product-uuid-2',
        name: 'Screen Protector',
        price: { toString: () => '9.99' } as any,
        compareAtPrice: null,
        stock: 30,
        isActive: true,
        slug: 'test-product',
        categoryId: 'cat-1',
        category: { isActive: true },
        images: [],
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
      addons: [],
      product: {
        id: 'product-uuid-3',
        name: 'Limited Edition Case — Gold',
        price: { toString: () => '49.99' } as any,
        compareAtPrice: null,
        stock: 2,
        isActive: true,
        slug: 'test-product',
        categoryId: 'cat-1',
        category: { isActive: true },
        images: [],
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
      addons: [],
      product: {
        id: 'product-uuid-1',
        name: 'iPhone 15 Pro Case',
        price: { toString: () => '29.99' } as any,
        compareAtPrice: null,
        stock: 50,
        isActive: true,
        slug: 'test-product',
        categoryId: 'cat-1',
        category: { isActive: true },
        images: [],
      },
    },
    {
      id: 'guest-item-2',
      productId: 'product-uuid-2',
      quantity: 1,
      createdAt: now,
      updatedAt: now,
      addons: [],
      product: {
        id: 'product-uuid-2',
        name: 'Screen Protector',
        price: { toString: () => '9.99' } as any,
        compareAtPrice: null,
        stock: 30,
        isActive: true,
        slug: 'test-product',
        categoryId: 'cat-1',
        category: { isActive: true },
        images: [],
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
  findProductForCartValidation: jest.fn(),
  setItemAddon: jest.fn(),
  unsetItemAddon: jest.fn(),
};

// ─── AddonApplicabilityResolver mock (TASK-174) ──────────────────────────────
//
// The resolver has its own exhaustive suite (addon-applicability.resolver.spec);
// here it is a stub whose OUTPUT the cart's money math and validation consume.
const addonResolverMock = {
  resolveForProduct: jest.fn(),
  resolveForProducts: jest.fn(),
};

const warrantyAddon = {
  addonServiceId: 'svc-warranty',
  name: 'Warranty',
  description: null,
  price: '499.00',
  source: 'template' as const,
};
const insuranceAddon = {
  addonServiceId: 'svc-insurance',
  name: 'Insurance',
  description: null,
  price: '899.00',
  source: 'template' as const,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CartService', () => {
  let service: CartService;

  beforeEach(async () => {
    jest.clearAllMocks();
    addonResolverMock.resolveForProducts.mockResolvedValue(new Map());
    addonResolverMock.resolveForProduct.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: CartRepository, useValue: cartRepositoryMock },
        { provide: AddonApplicabilityResolver, useValue: addonResolverMock },
      ],
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

    // Product details returned by the pre-write validation lookup for a product
    // that is not yet present in the cart.
    const activeProduct = {
      id: 'product-uuid-1',
      name: 'iPhone 15 Pro Case',
      stock: 50,
      isActive: true,
      category: { isActive: true },
    };

    it('should validate, add the item, and return the updated cart', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
      cartRepositoryMock.findProductForCartValidation.mockResolvedValue(activeProduct);
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
      cartRepositoryMock.findProductForCartValidation.mockResolvedValue(activeProduct);
      cartRepositoryMock.addItem.mockResolvedValue(mockCartWithVariantItem);

      await service.addToCart(tokenIdentity, addDto);

      expect(cartRepositoryMock.findOrCreate).toHaveBeenCalledWith(tokenIdentity);
      expect(cartRepositoryMock.addItem).toHaveBeenCalledWith(
        expect.objectContaining({ cartId: 'guest-cart-1' }),
      );
    });

    it('should validate against the loaded cart line without an extra product lookup', async () => {
      // Product already in the cart → details come from the loaded cart line,
      // so findProductForCartValidation must not be called.
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockCartWithVariantItem);
      cartRepositoryMock.addItem.mockResolvedValue(mockCartWithVariantItem);

      await service.addToCart(userIdentity, { productId: 'product-uuid-1', quantity: 1 });

      expect(cartRepositoryMock.findProductForCartValidation).not.toHaveBeenCalled();
      expect(cartRepositoryMock.addItem).toHaveBeenCalled();
    });

    it('should throw BadRequestException and NOT persist when product is out of stock', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
      cartRepositoryMock.findProductForCartValidation.mockResolvedValue({
        id: 'product-oos',
        name: 'Out of Stock Case',
        stock: 0,
        isActive: true,
        category: { isActive: true },
      });

      await expect(
        service.addToCart(userIdentity, { productId: 'product-oos', quantity: 1 }),
      ).rejects.toThrow(BadRequestException);
      expect(cartRepositoryMock.addItem).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException and NOT persist when quantity exceeds stock', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
      cartRepositoryMock.findProductForCartValidation.mockResolvedValue({
        id: 'product-uuid-3',
        name: 'Limited Edition Case — Gold',
        stock: 2,
        isActive: true,
        category: { isActive: true },
      });

      await expect(
        service.addToCart(userIdentity, { productId: 'product-uuid-3', quantity: 5 }),
      ).rejects.toThrow(BadRequestException);
      expect(cartRepositoryMock.addItem).not.toHaveBeenCalled();
    });

    it('should throw when existing qty (96) + incoming qty (5) exceeds MAX_QUANTITY (99)', async () => {
      // Existing line of qty 96; resultingQty 101 must fail before any write,
      // using the product details already on the loaded cart line.
      const cartWithHighQty: CartWithItems = {
        ...mockEmptyCart,
        items: [
          {
            id: 'item-high',
            productId: 'product-uuid-1',
            quantity: 96,
            createdAt: now,
            updatedAt: now,
            addons: [],
            product: {
              id: 'product-uuid-1',
              name: 'iPhone 15 Pro Case',
              price: { toString: () => '29.99' } as any,
              compareAtPrice: null,
              stock: 200,
              isActive: true,
              slug: 'test-product',
              categoryId: 'cat-1',
              category: { isActive: true },
              images: [],
            },
          },
        ],
      };
      cartRepositoryMock.findOrCreate.mockResolvedValue(cartWithHighQty);

      await expect(
        service.addToCart(userIdentity, { productId: 'product-uuid-1', quantity: 5 }),
      ).rejects.toThrow(BadRequestException);
      expect(cartRepositoryMock.findProductForCartValidation).not.toHaveBeenCalled();
      expect(cartRepositoryMock.addItem).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException and NOT persist when product is inactive', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
      cartRepositoryMock.findProductForCartValidation.mockResolvedValue({
        id: 'product-uuid-4',
        name: 'Discontinued Case',
        stock: 10,
        isActive: false,
        category: { isActive: true },
      });

      await expect(
        service.addToCart(userIdentity, { productId: 'product-uuid-4', quantity: 1 }),
      ).rejects.toThrow(BadRequestException);
      expect(cartRepositoryMock.addItem).not.toHaveBeenCalled();
    });

    // ─── withdrawn category blocks the add (TASK-297) ───────────────────────
    //
    // Deactivating a category takes its products OFF SALE, so an active, in-stock
    // product filed there must be as un-addable as a deactivated one — and, like
    // every other guard here, must fail BEFORE the write (no ghost line).
    it('should throw BadRequestException and NOT persist when the product CATEGORY is inactive', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
      cartRepositoryMock.findProductForCartValidation.mockResolvedValue({
        id: 'product-uuid-5',
        name: 'Case From A Withdrawn Category',
        stock: 10,
        isActive: true,
        category: { isActive: false },
      });

      await expect(
        service.addToCart(userIdentity, { productId: 'product-uuid-5', quantity: 1 }),
      ).rejects.toThrow(BadRequestException);
      expect(cartRepositoryMock.addItem).not.toHaveBeenCalled();
    });

    it('should refuse to TOP UP an existing line whose category was deactivated meanwhile', async () => {
      // The product details come from the already-loaded cart line here, so this
      // covers the branch that never calls findProductForCartValidation.
      const cartWithWithdrawnLine: CartWithItems = {
        ...mockEmptyCart,
        items: [
          {
            id: 'item-withdrawn',
            productId: 'product-uuid-1',
            quantity: 1,
            createdAt: now,
            updatedAt: now,
            addons: [],
            product: {
              id: 'product-uuid-1',
              name: 'iPhone 15 Pro Case',
              price: { toString: () => '29.99' } as any,
              compareAtPrice: null,
              stock: 200,
              isActive: true,
              slug: 'test-product',
              categoryId: 'cat-1',
              category: { isActive: false },
              images: [],
            },
          },
        ],
      };
      cartRepositoryMock.findOrCreate.mockResolvedValue(cartWithWithdrawnLine);

      await expect(
        service.addToCart(userIdentity, { productId: 'product-uuid-1', quantity: 1 }),
      ).rejects.toThrow(BadRequestException);
      expect(cartRepositoryMock.addItem).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException and NOT persist when the product does not exist', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
      cartRepositoryMock.findProductForCartValidation.mockResolvedValue(null);

      await expect(
        service.addToCart(userIdentity, { productId: 'ghost-product', quantity: 1 }),
      ).rejects.toThrow(NotFoundException);
      expect(cartRepositoryMock.addItem).not.toHaveBeenCalled();
    });

    it('should add a position to the cart', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
      cartRepositoryMock.findProductForCartValidation.mockResolvedValue({
        id: 'product-uuid-2',
        name: 'Screen Protector',
        stock: 30,
        isActive: true,
        category: { isActive: true },
      });
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
          { productId: 'product-uuid-1', quantity: 2, addonServiceIds: [] },
          { productId: 'product-uuid-2', quantity: 1, addonServiceIds: [] },
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
          { productId: 'product-uuid-1', quantity: 2, addonServiceIds: [] },
          { productId: 'product-uuid-2', quantity: 1, addonServiceIds: [] },
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
        lines: [{ productId: 'product-uuid-2', quantity: 99, addonServiceIds: [] }],
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
        lines: [{ productId: 'product-uuid-3', quantity: 2, addonServiceIds: [] }],
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
          { productId: 'product-uuid-2', quantity: 3, addonServiceIds: [] },
          { productId: 'product-uuid-1', quantity: 2, addonServiceIds: [] },
        ],
      });
    });
  });

  // ─── Add-on services (TASK-174, plan 150 cases 15–21) ────────────────────────

  describe('add-on services', () => {
    /** Two lines, so per-line vs. per-cart behaviour is distinguishable. */
    const twoLineCart = mockCartWithMultipleItems;

    const resolvedFor = (entries: Record<string, unknown[]>) => new Map(Object.entries(entries));

    describe('addonsTotal (cases 15–19)', () => {
      it('case 15 — no selected add-ons → addonsTotal is "0.00"', async () => {
        cartRepositoryMock.findOrCreate.mockResolvedValue(twoLineCart);
        addonResolverMock.resolveForProducts.mockResolvedValue(
          resolvedFor({ 'product-uuid-1': [warrantyAddon], 'product-uuid-2': [] }),
        );

        const cart = await service.getCart(userIdentity);

        expect(cart.totals.addonsTotal).toBe('0.00');
        // The add-on is still OFFERED on the line — just not selected.
        expect(cart.items[0].availableAddons).toHaveLength(1);
        expect(cart.items[0].selectedAddonIds).toEqual([]);
      });

      it('case 16 — one selected add-on is charged FLAT, not multiplied by line quantity', async () => {
        // Line 1 has quantity 2 — the warranty must still be charged once.
        cartRepositoryMock.findOrCreate.mockResolvedValue({
          ...twoLineCart,
          items: [
            { ...twoLineCart.items[0], addons: [{ addonServiceId: 'svc-warranty' }] },
            twoLineCart.items[1],
          ],
        });
        addonResolverMock.resolveForProducts.mockResolvedValue(
          resolvedFor({ 'product-uuid-1': [warrantyAddon], 'product-uuid-2': [] }),
        );

        const cart = await service.getCart(userIdentity);

        expect(cart.items[0].quantity).toBe(2);
        expect(cart.totals.addonsTotal).toBe('499.00');
        expect(cart.items[0].selectedAddonIds).toEqual(['svc-warranty']);
      });

      it('case 17 — two add-ons selected on the SAME line sum together', async () => {
        cartRepositoryMock.findOrCreate.mockResolvedValue({
          ...twoLineCart,
          items: [
            {
              ...twoLineCart.items[0],
              addons: [{ addonServiceId: 'svc-warranty' }, { addonServiceId: 'svc-insurance' }],
            },
            twoLineCart.items[1],
          ],
        });
        addonResolverMock.resolveForProducts.mockResolvedValue(
          resolvedFor({ 'product-uuid-1': [warrantyAddon, insuranceAddon], 'product-uuid-2': [] }),
        );

        const cart = await service.getCart(userIdentity);

        expect(cart.totals.addonsTotal).toBe('1398.00'); // 499 + 899
      });

      it('case 18 — the same add-on on TWO lines is counted once per line', async () => {
        cartRepositoryMock.findOrCreate.mockResolvedValue({
          ...twoLineCart,
          items: [
            { ...twoLineCart.items[0], addons: [{ addonServiceId: 'svc-warranty' }] },
            { ...twoLineCart.items[1], addons: [{ addonServiceId: 'svc-warranty' }] },
          ],
        });
        addonResolverMock.resolveForProducts.mockResolvedValue(
          resolvedFor({ 'product-uuid-1': [warrantyAddon], 'product-uuid-2': [warrantyAddon] }),
        );

        const cart = await service.getCart(userIdentity);

        expect(cart.totals.addonsTotal).toBe('998.00'); // 499 twice
      });

      it('case 19 — subtotal is unaffected by add-ons: they are separate CartTotals fields', async () => {
        cartRepositoryMock.findOrCreate.mockResolvedValue({
          ...twoLineCart,
          items: [
            { ...twoLineCart.items[0], addons: [{ addonServiceId: 'svc-warranty' }] },
            twoLineCart.items[1],
          ],
        });
        addonResolverMock.resolveForProducts.mockResolvedValue(
          resolvedFor({ 'product-uuid-1': [warrantyAddon], 'product-uuid-2': [] }),
        );

        const cart = await service.getCart(userIdentity);

        // 29.99 × 2 + 9.99 × 1 — exactly what it was with no add-ons at all.
        expect(cart.totals.subtotal).toBe('69.97');
        expect(cart.totals.addonsTotal).toBe('499.00');
      });

      it('uses the EFFECTIVE (overridden) price the resolver returned, not the catalog price', async () => {
        cartRepositoryMock.findOrCreate.mockResolvedValue({
          ...twoLineCart,
          items: [
            { ...twoLineCart.items[0], addons: [{ addonServiceId: 'svc-insurance' }] },
            twoLineCart.items[1],
          ],
        });
        addonResolverMock.resolveForProducts.mockResolvedValue(
          resolvedFor({
            'product-uuid-1': [{ ...insuranceAddon, price: '1299.00', source: 'override' }],
            'product-uuid-2': [],
          }),
        );

        const cart = await service.getCart(userIdentity);

        expect(cart.totals.addonsTotal).toBe('1299.00');
      });

      it('drops a STALE selection (no longer resolved) from both the read and the total', async () => {
        cartRepositoryMock.findOrCreate.mockResolvedValue({
          ...twoLineCart,
          items: [
            { ...twoLineCart.items[0], addons: [{ addonServiceId: 'svc-retired' }] },
            twoLineCart.items[1],
          ],
        });
        addonResolverMock.resolveForProducts.mockResolvedValue(
          resolvedFor({ 'product-uuid-1': [warrantyAddon], 'product-uuid-2': [] }),
        );

        const cart = await service.getCart(userIdentity);

        expect(cart.items[0].selectedAddonIds).toEqual([]);
        expect(cart.totals.addonsTotal).toBe('0.00');
      });

      it('resolves the whole cart in ONE batched call (no N+1)', async () => {
        cartRepositoryMock.findOrCreate.mockResolvedValue(twoLineCart);

        await service.getCart(userIdentity);

        expect(addonResolverMock.resolveForProducts).toHaveBeenCalledTimes(1);
        expect(addonResolverMock.resolveForProduct).not.toHaveBeenCalled();
      });
    });

    describe('toggleAddon (cases 20–21)', () => {
      beforeEach(() => {
        cartRepositoryMock.findByUserId.mockResolvedValue(twoLineCart);
        cartRepositoryMock.findOrCreate.mockResolvedValue(twoLineCart);
      });

      it("case 20 — rejects an add-on that is NOT in the line's resolved set, writing nothing", async () => {
        addonResolverMock.resolveForProduct.mockResolvedValue([warrantyAddon]);

        await expect(
          service.toggleAddon(userIdentity, 'item-uuid-1', 'svc-insurance', true),
        ).rejects.toThrow(BadRequestException);

        expect(cartRepositoryMock.setItemAddon).not.toHaveBeenCalled();
      });

      it('case 20b — accepts an add-on that IS resolved for the line', async () => {
        addonResolverMock.resolveForProduct.mockResolvedValue([warrantyAddon]);

        await service.toggleAddon(userIdentity, 'item-uuid-1', 'svc-warranty', true);

        expect(cartRepositoryMock.setItemAddon).toHaveBeenCalledWith('item-uuid-1', 'svc-warranty');
      });

      it('case 21 — selecting twice never duplicates the row (repository upsert)', async () => {
        addonResolverMock.resolveForProduct.mockResolvedValue([warrantyAddon]);

        await service.toggleAddon(userIdentity, 'item-uuid-1', 'svc-warranty', true);
        await service.toggleAddon(userIdentity, 'item-uuid-1', 'svc-warranty', true);

        expect(cartRepositoryMock.setItemAddon).toHaveBeenLastCalledWith(
          'item-uuid-1',
          'svc-warranty',
        );
      });

      it('case 21b — deselecting an unselected add-on is a no-op, not an error', async () => {
        await expect(
          service.toggleAddon(userIdentity, 'item-uuid-1', 'svc-warranty', false),
        ).resolves.toBeDefined();

        expect(cartRepositoryMock.unsetItemAddon).toHaveBeenCalledWith(
          'item-uuid-1',
          'svc-warranty',
        );
        // Deselection never consults the resolver — a stale selection must stay removable.
        expect(addonResolverMock.resolveForProduct).not.toHaveBeenCalled();
      });

      it('404s for an unknown cart item and for a missing cart', async () => {
        await expect(
          service.toggleAddon(userIdentity, 'ghost-item', 'svc-warranty', true),
        ).rejects.toThrow(NotFoundException);

        cartRepositoryMock.findByUserId.mockResolvedValue(null);
        await expect(
          service.toggleAddon(userIdentity, 'item-uuid-1', 'svc-warranty', true),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('mergeGuestCart — add-on collision rule (union, then filter)', () => {
      it('unions the guest and user selections and drops what no longer resolves', async () => {
        cartRepositoryMock.findByToken.mockResolvedValue({
          ...mockGuestCart,
          items: [
            { ...mockGuestCart.items[0], addons: [{ addonServiceId: 'svc-warranty' }] },
            { ...mockGuestCart.items[1], addons: [{ addonServiceId: 'svc-retired' }] },
          ],
        });
        cartRepositoryMock.findByUserId.mockResolvedValue({
          ...mockCartWithMultipleItems,
          id: 'user-cart-1',
          items: [
            // Same product as guest line 1, but a DIFFERENT add-on selected.
            {
              ...mockCartWithMultipleItems.items[0],
              addons: [{ addonServiceId: 'svc-insurance' }],
            },
          ],
        });
        addonResolverMock.resolveForProducts.mockResolvedValue(
          new Map([
            ['product-uuid-1', [warrantyAddon, insuranceAddon]],
            ['product-uuid-2', []], // 'svc-retired' no longer resolves here
          ]),
        );

        await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

        expect(cartRepositoryMock.mergeGuestCartIntoUser).toHaveBeenCalledWith({
          userCartId: 'user-cart-1',
          guestCartId: 'guest-cart-1',
          lines: [
            {
              productId: 'product-uuid-1',
              quantity: 4, // 2 (guest) + 2 (user)
              addonServiceIds: ['svc-warranty', 'svc-insurance'], // union; both still resolve
            },
            {
              productId: 'product-uuid-2',
              quantity: 1,
              addonServiceIds: [], // the stale selection is dropped, not carried over
            },
          ],
        });
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
            addons: [],
            product: {
              id: 'product-whole',
              name: 'Cable',
              price: { toString: () => '10.00' } as any,
              compareAtPrice: null,
              stock: 100,
              isActive: true,
              slug: 'test-product',
              categoryId: 'cat-1',
              category: { isActive: true },
              images: [],
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
            addons: [],
            product: {
              id: 'product-diff',
              name: 'Premium Case — Limited Edition',
              price: { toString: () => '49.99' } as any,
              compareAtPrice: null,
              stock: 10,
              isActive: true,
              slug: 'test-product',
              categoryId: 'cat-1',
              category: { isActive: true },
              images: [],
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
