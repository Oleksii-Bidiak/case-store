import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CartRepository, CartWithItems } from './cart.repository';
import { CartService } from './cart.service';
import { CartEntity, CartItemEntity } from './entities';
import { AddToCartDto, UpdateCartItemDto } from './dto';
import type { ResolvedCartIdentity } from './cart-identity.types';
import { AddonApplicabilityResolver } from '../addon-service';
import { createCartRepositoryMock } from '../../test/cart-repository.mock';

// ─── Identities ─────────────────────────────────────────────────────────────

const userIdentity: ResolvedCartIdentity = { type: 'user', userId: 'user-uuid-1' };
const tokenIdentity: ResolvedCartIdentity = { type: 'token', token: 'guest-token-1' };

// ─── Mock data ────────────────────────────────────────────────────────────────

const now = new Date('2026-05-07T12:00:00.000Z');

const mockCartWithSaleItem: CartWithItems = {
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

const mockCartWithFullPriceItem: CartWithItems = {
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

const cartRepositoryMock = createCartRepositoryMock();

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
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithSaleItem);

      const result = await service.getCart(userIdentity);

      expect(result).toBeInstanceOf(CartEntity);
      expect(result.id).toBe('cart-uuid-1');
      expect(result.userId).toBe('user-uuid-1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toBeInstanceOf(CartItemEntity);
      expect(result.totals.subtotal).toBe('59.98'); // 29.99 × 2
      expect(result.totals.itemCount).toBe(2);
      expect(result.totals.uniqueItems).toBe(1);
      expect(cartRepositoryMock.findByUserId).toHaveBeenCalledWith('user-uuid-1');
    });

    it('should return empty cart with zero totals when no items', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockEmptyCart);

      const result = await service.getCart(userIdentity);

      expect(result.items).toHaveLength(0);
      expect(result.totals.subtotal).toBe('0.00');
      expect(result.totals.itemCount).toBe(0);
      expect(result.totals.uniqueItems).toBe(0);
    });

    it('should calculate totals correctly for multiple items', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithMultipleItems);

      const result = await service.getCart(userIdentity);

      // 29.99 × 2 (sale line) + 9.99 × 1 (full-price line) = 69.97
      expect(result.totals.subtotal).toBe('69.97');
      expect(result.totals.itemCount).toBe(3); // 2 + 1
      expect(result.totals.uniqueItems).toBe(2);
    });

    it('should price a full-price line at the product price', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithFullPriceItem);

      const result = await service.getCart(userIdentity);

      expect(result.items[0].price).toBe('9.99');
      expect(result.items[0].lineTotal).toBe('9.99'); // 9.99 × 1
    });

    it('should price a sale line at the product price, not compareAtPrice', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithSaleItem);

      const result = await service.getCart(userIdentity);

      expect(result.items[0].price).toBe('29.99');
      expect(result.items[0].lineTotal).toBe('59.98'); // 29.99 × 2
    });

    it('should resolve a guest cart for a token identity', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue(mockGuestCart);

      const result = await service.getCart(tokenIdentity);

      expect(result.userId).toBeNull();
      expect(cartRepositoryMock.findByToken).toHaveBeenCalledWith('guest-token-1');
    });
    // TASK-776: a read must never write. The header badge fetches the cart on
    // every storefront page, so an upsert here left one empty row per visitor
    // (and per crawler) forever.
    describe('when the identity has no cart yet (TASK-776)', () => {
      const writeMethods = [
        'findOrCreate',
        'addItem',
        'updateItem',
        'removeItem',
        'clearItems',
        'assignCartToUser',
        'mergeGuestCartIntoUser',
        'setItemAddon',
        'unsetItemAddon',
      ] as const;

      it('returns an empty, unsaved guest cart and calls no write method', async () => {
        cartRepositoryMock.findByToken.mockResolvedValue(null);

        const result = await service.getCart(tokenIdentity);

        expect(result).toBeInstanceOf(CartEntity);
        expect(result.userId).toBeNull();
        expect(result.items).toEqual([]);
        expect(result.totals).toEqual({
          subtotal: '0.00',
          itemCount: 0,
          uniqueItems: 0,
          addonsTotal: '0.00',
        });
        expect(typeof result.id).toBe('string');
        expect(result.createdAt).toBeInstanceOf(Date);
        expect(result.updatedAt).toBeInstanceOf(Date);
        for (const method of writeMethods) {
          expect(cartRepositoryMock[method]).not.toHaveBeenCalled();
        }
      });

      it('returns an empty, unsaved cart owned by the user for a user identity', async () => {
        cartRepositoryMock.findByUserId.mockResolvedValue(null);

        const result = await service.getCart(userIdentity);

        expect(result.userId).toBe('user-uuid-1');
        expect(result.items).toEqual([]);
        for (const method of writeMethods) {
          expect(cartRepositoryMock[method]).not.toHaveBeenCalled();
        }
      });
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
      cartRepositoryMock.addItem.mockResolvedValue(mockCartWithSaleItem);

      const result = await service.addToCart(userIdentity, addDto);

      expect(result).toBeInstanceOf(CartEntity);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(2);
      expect(cartRepositoryMock.findOrCreate).toHaveBeenCalledWith(userIdentity);
      expect(cartRepositoryMock.addItem).toHaveBeenCalledWith(
        {
          cartId: 'cart-uuid-1',
          productId: 'product-uuid-1',
          quantity: 2,
        },
        expect.any(Function),
      );
    });

    // TASK-779: the pre-check above runs on a read taken OUTSIDE the write, so a
    // concurrent add can slip past it. The authoritative check is the guard the
    // service hands to the repository, which runs it inside the locked write
    // transaction against the fresh line quantity.
    describe('in-transaction guard (TASK-779)', () => {
      const guardPassedToRepository = () => cartRepositoryMock.addItem.mock.calls[0][1];

      it('hands the repository a guard that enforces the purchasability rule', async () => {
        cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
        cartRepositoryMock.findProductForCartValidation.mockResolvedValue(activeProduct);
        cartRepositoryMock.addItem.mockResolvedValue(mockCartWithSaleItem);

        await service.addToCart(userIdentity, addDto);

        const guard = guardPassedToRepository();
        expect(() => guard({ ...activeProduct, stock: 1 }, 2)).toThrow(BadRequestException);
        expect(() => guard({ ...activeProduct, isActive: false }, 1)).toThrow(BadRequestException);
        expect(() => guard(activeProduct, 100)).toThrow(BadRequestException);
        expect(() => guard(activeProduct, 50)).not.toThrow();
      });

      it('answers 400 when the fresh in-transaction state refuses the add (a concurrent add won)', async () => {
        cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
        // The stale pre-check read sees stock 1 and an empty line — it passes.
        cartRepositoryMock.findProductForCartValidation.mockResolvedValue({
          ...activeProduct,
          stock: 1,
        });
        // Inside the lock the line already holds the 1 unit a racing request added.
        cartRepositoryMock.addItem.mockImplementation(async (_input, guard) => {
          guard({ ...activeProduct, stock: 1 }, 2);
          return mockCartWithSaleItem;
        });

        await expect(
          service.addToCart(userIdentity, { productId: 'product-uuid-1', quantity: 1 }),
        ).rejects.toThrow(BadRequestException);
      });

      it('answers 404 when the product vanished before the locked write', async () => {
        cartRepositoryMock.findOrCreate.mockResolvedValue(mockEmptyCart);
        cartRepositoryMock.findProductForCartValidation.mockResolvedValue(activeProduct);
        cartRepositoryMock.addItem.mockResolvedValue(null);

        await expect(service.addToCart(userIdentity, addDto)).rejects.toThrow(NotFoundException);
      });
    });

    it('should work for a guest token identity', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue({ ...mockEmptyCart, id: 'guest-cart-1' });
      cartRepositoryMock.findProductForCartValidation.mockResolvedValue(activeProduct);
      cartRepositoryMock.addItem.mockResolvedValue(mockCartWithSaleItem);

      await service.addToCart(tokenIdentity, addDto);

      expect(cartRepositoryMock.findOrCreate).toHaveBeenCalledWith(tokenIdentity);
      expect(cartRepositoryMock.addItem).toHaveBeenCalledWith(
        expect.objectContaining({ cartId: 'guest-cart-1' }),
        expect.any(Function),
      );
    });

    it('should validate against the loaded cart line without an extra product lookup', async () => {
      // Product already in the cart → details come from the loaded cart line,
      // so findProductForCartValidation must not be called.
      cartRepositoryMock.findOrCreate.mockResolvedValue(mockCartWithSaleItem);
      cartRepositoryMock.addItem.mockResolvedValue(mockCartWithSaleItem);

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
      cartRepositoryMock.addItem.mockResolvedValue(mockCartWithFullPriceItem);

      const dto: AddToCartDto = {
        productId: 'product-uuid-2',
        quantity: 1,
      };

      const result = await service.addToCart(userIdentity, dto);

      expect(result.items[0].productId).toBe('product-uuid-2');
      expect(cartRepositoryMock.addItem).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'product-uuid-2' }),
        expect.any(Function),
      );
    });
  });

  // ─── updateItem ──────────────────────────────────────────────────────────────

  describe('updateItem', () => {
    const updateDto: UpdateCartItemDto = { quantity: 5 };
    // The bare `cart_items` row `CartRepository.updateItem` returns.
    const updatedItemRow = {
      id: 'item-uuid-1',
      cartId: 'cart-uuid-1',
      productId: 'product-uuid-1',
      quantity: 5,
      createdAt: now,
      updatedAt: now,
    };

    it('should update item quantity and return updated cart', async () => {
      const updatedCart: CartWithItems = {
        ...mockCartWithSaleItem,
        items: [{ ...mockCartWithSaleItem.items[0], quantity: 5 }],
      };
      cartRepositoryMock.findByUserId
        .mockResolvedValueOnce(mockCartWithSaleItem)
        .mockResolvedValueOnce(updatedCart);
      cartRepositoryMock.updateItem.mockResolvedValue(updatedItemRow);

      const result = await service.updateItem(userIdentity, 'item-uuid-1', updateDto);

      expect(result).toBeInstanceOf(CartEntity);
      expect(result.items[0].quantity).toBe(5);
      expect(cartRepositoryMock.updateItem).toHaveBeenCalledWith('item-uuid-1', { quantity: 5 });
    });

    it('should resolve a guest cart by token for update', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue({
        ...mockCartWithSaleItem,
        userId: null,
        token: 'guest-token-1',
      });
      cartRepositoryMock.updateItem.mockResolvedValue(updatedItemRow);

      await service.updateItem(tokenIdentity, 'item-uuid-1', updateDto);

      expect(cartRepositoryMock.findByToken).toHaveBeenCalledWith('guest-token-1');
    });

    it('should throw NotFoundException when item does not exist', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithSaleItem);

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
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithSaleItem);

      await expect(
        service.updateItem(userIdentity, 'item-uuid-1', { quantity: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when cart does not exist', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(null);

      await expect(service.updateItem(userIdentity, 'item-uuid-1', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    // TASK-778: an update is held to the SAME purchasability rule as an add —
    // "+" on a withdrawn line used to answer 200 while POST /cart/items on the
    // very same product answered 400.
    describe('withdrawn lines (TASK-778)', () => {
      const withLineProduct = (patch: Record<string, unknown>): CartWithItems => ({
        ...mockCartWithSaleItem,
        items: [
          {
            ...mockCartWithSaleItem.items[0],
            product: { ...mockCartWithSaleItem.items[0].product, ...patch },
          },
        ],
      });

      it('rejects with 400 and writes nothing when the product was deactivated', async () => {
        cartRepositoryMock.findByUserId.mockResolvedValue(withLineProduct({ isActive: false }));

        await expect(
          service.updateItem(userIdentity, 'item-uuid-1', { quantity: 3 }),
        ).rejects.toThrow(
          new BadRequestException('Product "iPhone 15 Pro Case" is no longer available'),
        );
        expect(cartRepositoryMock.updateItem).not.toHaveBeenCalled();
      });

      it('rejects with 400 and writes nothing when the product CATEGORY was deactivated', async () => {
        cartRepositoryMock.findByUserId.mockResolvedValue(
          withLineProduct({ category: { isActive: false } }),
        );

        await expect(
          service.updateItem(userIdentity, 'item-uuid-1', { quantity: 3 }),
        ).rejects.toThrow(BadRequestException);
        expect(cartRepositoryMock.updateItem).not.toHaveBeenCalled();
      });

      it('reports the same stock message as an add does', async () => {
        cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithLowStockItem);

        await expect(
          service.updateItem(userIdentity, 'item-uuid-3', { quantity: 5 }),
        ).rejects.toThrow(
          'Requested quantity (5) exceeds available stock (2) for "Limited Edition Case — Gold"',
        );
        expect(cartRepositoryMock.updateItem).not.toHaveBeenCalled();
      });
    });
  });

  // ─── removeItem ──────────────────────────────────────────────────────────────

  describe('removeItem', () => {
    it('should remove item and return updated cart', async () => {
      cartRepositoryMock.removeItem.mockResolvedValue(undefined);
      const afterRemoval: CartWithItems = {
        ...mockCartWithMultipleItems,
        items: [mockCartWithMultipleItems.items[1]],
      };
      cartRepositoryMock.findByUserId
        .mockResolvedValueOnce(mockCartWithMultipleItems)
        .mockResolvedValueOnce(afterRemoval);

      const result = await service.removeItem(userIdentity, 'item-uuid-1');

      expect(cartRepositoryMock.removeItem).toHaveBeenCalledWith('item-uuid-1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].productId).toBe('product-uuid-2');
    });

    it('should throw NotFoundException when item not in cart', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithSaleItem);

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
      cartRepositoryMock.findByUserId
        .mockResolvedValueOnce(mockCartWithMultipleItems)
        .mockResolvedValueOnce(mockEmptyCart);
      cartRepositoryMock.clearItems.mockResolvedValue(undefined);

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

    // TASK-777 — ONE rule for every branch: the merged line keeps the LARGER of
    // the two quantities, max(user, guest), capped at MAX_QUANTITY. Stock is NOT
    // applied during the merge (it is checked where it is for any line — in the
    // cart read's maxQty and at checkout), so a login never silently shrinks what
    // the shopper had put in either cart.
    describe('quantity rule — keeps the larger (TASK-777)', () => {
      const userCartWith = (quantity: number, stock = 50) => ({
        ...mockEmptyCart,
        id: 'user-cart-1',
        items: [
          {
            ...mockCartWithFullPriceItem.items[0],
            id: 'user-item-x',
            quantity,
            product: { ...mockCartWithFullPriceItem.items[0].product, stock },
          },
        ],
      });
      const guestCartWith = (quantity: number, stock = 50) => ({
        ...mockGuestCart,
        items: [
          {
            ...mockGuestCart.items[1], // product-uuid-2, same position as the user line
            quantity,
            product: { ...mockGuestCart.items[1].product, stock },
          },
        ],
      });
      const writtenLines = () =>
        cartRepositoryMock.mergeGuestCartIntoUser.mock.calls[0][0].lines as Array<{
          productId: string;
          quantity: number;
        }>;

      it('both carts hold the line → the larger quantity wins (guest larger)', async () => {
        cartRepositoryMock.findByToken.mockResolvedValue(guestCartWith(7));
        cartRepositoryMock.findByUserId.mockResolvedValue(userCartWith(3));

        await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

        expect(writtenLines()).toEqual([
          { productId: 'product-uuid-2', quantity: 7, addonServiceIds: [] },
        ]);
      });

      it('both carts hold the line → the larger quantity wins (user larger), never the sum', async () => {
        cartRepositoryMock.findByToken.mockResolvedValue(guestCartWith(2));
        cartRepositoryMock.findByUserId.mockResolvedValue(userCartWith(10));

        await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

        expect(writtenLines()).toEqual([
          { productId: 'product-uuid-2', quantity: 10, addonServiceIds: [] },
        ]);
      });

      it('only the guest holds the line → its quantity is kept as-is', async () => {
        cartRepositoryMock.findByToken.mockResolvedValue(guestCartWith(5));
        cartRepositoryMock.findByUserId.mockResolvedValue({ ...mockEmptyCart, id: 'user-cart-1' });

        await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

        expect(writtenLines()).toEqual([
          { productId: 'product-uuid-2', quantity: 5, addonServiceIds: [] },
        ]);
      });

      it('stock below both quantities does NOT trim the merged line (10 stays 10 at stock 2)', async () => {
        cartRepositoryMock.findByToken.mockResolvedValue(guestCartWith(3, 2));
        cartRepositoryMock.findByUserId.mockResolvedValue(userCartWith(10, 2));

        await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

        expect(writtenLines()).toEqual([
          { productId: 'product-uuid-2', quantity: 10, addonServiceIds: [] },
        ]);
      });

      it('zero stock follows the same rule: the line is written, not skipped', async () => {
        cartRepositoryMock.findByToken.mockResolvedValue(guestCartWith(3, 0));
        cartRepositoryMock.findByUserId.mockResolvedValue(userCartWith(1, 0));

        await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

        expect(writtenLines()).toEqual([
          { productId: 'product-uuid-2', quantity: 3, addonServiceIds: [] },
        ]);
      });

      it('zero stock on a guest-only line keeps the line as well', async () => {
        cartRepositoryMock.findByToken.mockResolvedValue(guestCartWith(4, 0));
        cartRepositoryMock.findByUserId.mockResolvedValue({ ...mockEmptyCart, id: 'user-cart-1' });

        await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

        expect(writtenLines()).toEqual([
          { productId: 'product-uuid-2', quantity: 4, addonServiceIds: [] },
        ]);
      });

      it('caps at MAX_QUANTITY (99) — 99 and 99 merge to 99, not 198', async () => {
        cartRepositoryMock.findByToken.mockResolvedValue(guestCartWith(99, 500));
        cartRepositoryMock.findByUserId.mockResolvedValue(userCartWith(99, 500));

        await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

        expect(writtenLines()).toEqual([
          { productId: 'product-uuid-2', quantity: 99, addonServiceIds: [] },
        ]);
      });

      it('caps a line that is already above MAX_QUANTITY (legacy row) at 99', async () => {
        cartRepositoryMock.findByToken.mockResolvedValue(guestCartWith(120, 500));
        cartRepositoryMock.findByUserId.mockResolvedValue(userCartWith(4, 500));

        await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

        expect(writtenLines()).toEqual([
          { productId: 'product-uuid-2', quantity: 99, addonServiceIds: [] },
        ]);
      });
    });

    it('should merge overlapping and new lines together, keeping an out-of-stock line', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue({
        ...mockGuestCart,
        items: [
          // Overlapping item: guest 1, user 2 → the larger, 2
          { ...mockGuestCart.items[1], quantity: 1 },
          // Brand-new position (stock 50): copied as-is
          { ...mockCartWithSaleItem.items[0], id: 'guest-new', quantity: 2 },
          // Out-of-stock position: kept — stock is checked in the cart and at checkout
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
        items: [{ ...mockCartWithFullPriceItem.items[0], id: 'user-item-x', quantity: 2 }],
      });

      await service.mergeGuestCart('guest-token-1', 'user-uuid-1');

      expect(cartRepositoryMock.mergeGuestCartIntoUser).toHaveBeenCalledWith({
        userCartId: 'user-cart-1',
        guestCartId: 'guest-cart-1',
        lines: [
          { productId: 'product-uuid-2', quantity: 2, addonServiceIds: [] },
          { productId: 'product-uuid-1', quantity: 2, addonServiceIds: [] },
          { productId: 'product-uuid-3', quantity: 3, addonServiceIds: [] },
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
        cartRepositoryMock.findByUserId.mockResolvedValue(twoLineCart);
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
        cartRepositoryMock.findByUserId.mockResolvedValue({
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
        cartRepositoryMock.findByUserId.mockResolvedValue({
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
        cartRepositoryMock.findByUserId.mockResolvedValue({
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
        cartRepositoryMock.findByUserId.mockResolvedValue({
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
        cartRepositoryMock.findByUserId.mockResolvedValue({
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
        cartRepositoryMock.findByUserId.mockResolvedValue({
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
        await service.getCart(userIdentity);

        expect(addonResolverMock.resolveForProducts).toHaveBeenCalledTimes(1);
        expect(addonResolverMock.resolveForProduct).not.toHaveBeenCalled();
      });
    });

    describe('toggleAddon (cases 20–21)', () => {
      beforeEach(() => {
        cartRepositoryMock.findByUserId.mockResolvedValue(twoLineCart);
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
              quantity: 2, // max(2 guest, 2 user) — the larger, never the sum (TASK-777)
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
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithWholePrice);

      const result = await service.getCart(userIdentity);

      expect(result.totals.subtotal).toBe('30.00');
      expect(result.items[0].lineTotal).toBe('30.00');
    });

    it('should handle single item with quantity 1', async () => {
      cartRepositoryMock.findByUserId.mockResolvedValue(mockCartWithFullPriceItem);

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
      cartRepositoryMock.findByUserId.mockResolvedValue(cartWithPosition);

      const result = await service.getCart(userIdentity);

      expect(result.items[0].price).toBe('49.99');
      expect(result.totals.subtotal).toBe('49.99');
    });
  });
});
