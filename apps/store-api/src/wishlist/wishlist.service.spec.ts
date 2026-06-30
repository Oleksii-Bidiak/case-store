import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WishlistRepository, WishlistWithItems } from './wishlist.repository';
import { WishlistService } from './wishlist.service';
import type { ResolvedWishlistIdentity } from './wishlist-identity.types';

// ─── Identities ─────────────────────────────────────────────────────────────

const userIdentity: ResolvedWishlistIdentity = { type: 'user', userId: 'user-uuid-1' };
const tokenIdentity: ResolvedWishlistIdentity = { type: 'token', token: 'guest-token-1' };

// ─── Mock data ──────────────────────────────────────────────────────────────

const now = new Date('2026-06-30T12:00:00.000Z');

function buildItem(productId: string, id = `item-${productId}`) {
  return {
    id,
    productId,
    createdAt: now,
    product: {
      id: productId,
      name: `Product ${productId}`,
      slug: `slug-${productId}`,
      price: { toString: () => '29.99' } as any,
      compareAtPrice: null,
      stock: 50,
      isActive: true,
      images: [] as Array<{ url: string }>,
    },
  };
}

const emptyUserWishlist: WishlistWithItems = {
  id: 'user-wishlist-1',
  userId: 'user-uuid-1',
  token: null,
  createdAt: now,
  updatedAt: now,
  items: [],
};

const guestWishlist: WishlistWithItems = {
  id: 'guest-wishlist-1',
  userId: null,
  token: 'guest-token-1',
  createdAt: now,
  updatedAt: now,
  items: [buildItem('product-uuid-1'), buildItem('product-uuid-2')],
};

// ─── Repository mock ──────────────────────────────────────────────────────────

const wishlistRepositoryMock = {
  findByUserId: jest.fn(),
  findByToken: jest.fn(),
  findOrCreate: jest.fn(),
  addItem: jest.fn(),
  removeItem: jest.fn(),
  findItem: jest.fn(),
  assignWishlistToUser: jest.fn(),
  mergeGuestWishlistIntoUser: jest.fn(),
  findProductForWishlistValidation: jest.fn(),
};

describe('WishlistService', () => {
  let service: WishlistService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WishlistService,
        { provide: WishlistRepository, useValue: wishlistRepositoryMock },
      ],
    }).compile();

    service = moduleRef.get<WishlistService>(WishlistService);
  });

  // ─── getWishlist ────────────────────────────────────────────────────────────

  describe('getWishlist', () => {
    it('returns the wishlist with an itemCount derived from items', async () => {
      wishlistRepositoryMock.findOrCreate.mockResolvedValue(guestWishlist);

      const result = await service.getWishlist(tokenIdentity);

      expect(wishlistRepositoryMock.findOrCreate).toHaveBeenCalledWith(tokenIdentity);
      expect(result.itemCount).toBe(2);
      expect(result.items).toHaveLength(2);
      // The guest token must never leak into the JSON entity.
      expect(result.token).toBeUndefined();
    });
  });

  // ─── add ──────────────────────────────────────────────────────────────────────

  describe('add', () => {
    it('validates the product exists before saving it', async () => {
      wishlistRepositoryMock.findOrCreate.mockResolvedValue(emptyUserWishlist);
      wishlistRepositoryMock.findProductForWishlistValidation.mockResolvedValue(null);

      await expect(service.add(userIdentity, { productId: 'missing' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(wishlistRepositoryMock.addItem).not.toHaveBeenCalled();
    });

    it('adds the product when it exists', async () => {
      wishlistRepositoryMock.findOrCreate.mockResolvedValue(emptyUserWishlist);
      wishlistRepositoryMock.findProductForWishlistValidation.mockResolvedValue({
        id: 'product-uuid-1',
      });
      wishlistRepositoryMock.addItem.mockResolvedValue({
        ...emptyUserWishlist,
        items: [buildItem('product-uuid-1')],
      });

      const result = await service.add(userIdentity, { productId: 'product-uuid-1' });

      expect(wishlistRepositoryMock.addItem).toHaveBeenCalledWith(
        'user-wishlist-1',
        'product-uuid-1',
      );
      expect(result.itemCount).toBe(1);
    });
  });

  // ─── toggle ─────────────────────────────────────────────────────────────────

  describe('toggle', () => {
    it('removes the product when it is already saved (idempotent off)', async () => {
      wishlistRepositoryMock.findOrCreate.mockResolvedValue({
        ...emptyUserWishlist,
        items: [buildItem('product-uuid-1')],
      });
      wishlistRepositoryMock.findItem.mockResolvedValue({ id: 'item-1' });
      wishlistRepositoryMock.removeItem.mockResolvedValue(emptyUserWishlist);

      const result = await service.toggle(userIdentity, { productId: 'product-uuid-1' });

      expect(wishlistRepositoryMock.removeItem).toHaveBeenCalledWith(
        'user-wishlist-1',
        'product-uuid-1',
      );
      expect(wishlistRepositoryMock.addItem).not.toHaveBeenCalled();
      expect(result.itemCount).toBe(0);
    });

    it('adds the product when it is not saved, validating existence first', async () => {
      wishlistRepositoryMock.findOrCreate.mockResolvedValue(emptyUserWishlist);
      wishlistRepositoryMock.findItem.mockResolvedValue(null);
      wishlistRepositoryMock.findProductForWishlistValidation.mockResolvedValue({
        id: 'product-uuid-1',
      });
      wishlistRepositoryMock.addItem.mockResolvedValue({
        ...emptyUserWishlist,
        items: [buildItem('product-uuid-1')],
      });

      const result = await service.toggle(userIdentity, { productId: 'product-uuid-1' });

      expect(wishlistRepositoryMock.addItem).toHaveBeenCalledWith(
        'user-wishlist-1',
        'product-uuid-1',
      );
      expect(wishlistRepositoryMock.removeItem).not.toHaveBeenCalled();
      expect(result.itemCount).toBe(1);
    });
  });

  // ─── mergeGuestWishlist ──────────────────────────────────────────────────────

  describe('mergeGuestWishlist', () => {
    it('is a no-op when the guest wishlist does not exist', async () => {
      wishlistRepositoryMock.findByToken.mockResolvedValue(null);

      await service.mergeGuestWishlist('guest-token-1', 'user-uuid-1');

      expect(wishlistRepositoryMock.findByUserId).not.toHaveBeenCalled();
      expect(wishlistRepositoryMock.assignWishlistToUser).not.toHaveBeenCalled();
      expect(wishlistRepositoryMock.mergeGuestWishlistIntoUser).not.toHaveBeenCalled();
    });

    it('is a no-op when the guest wishlist is empty', async () => {
      wishlistRepositoryMock.findByToken.mockResolvedValue({
        ...guestWishlist,
        items: [],
      });

      await service.mergeGuestWishlist('guest-token-1', 'user-uuid-1');

      expect(wishlistRepositoryMock.assignWishlistToUser).not.toHaveBeenCalled();
      expect(wishlistRepositoryMock.mergeGuestWishlistIntoUser).not.toHaveBeenCalled();
    });

    it('reassigns the guest wishlist when the user has no existing wishlist', async () => {
      wishlistRepositoryMock.findByToken.mockResolvedValue(guestWishlist);
      wishlistRepositoryMock.findByUserId.mockResolvedValue(null);
      wishlistRepositoryMock.assignWishlistToUser.mockResolvedValue(true);

      await service.mergeGuestWishlist('guest-token-1', 'user-uuid-1');

      expect(wishlistRepositoryMock.assignWishlistToUser).toHaveBeenCalledWith(
        'guest-wishlist-1',
        'user-uuid-1',
      );
      expect(wishlistRepositoryMock.mergeGuestWishlistIntoUser).not.toHaveBeenCalled();
    });

    it('falls back to merging into a concurrently-created user wishlist on reassign conflict', async () => {
      wishlistRepositoryMock.findByToken.mockResolvedValue(guestWishlist);
      wishlistRepositoryMock.findByUserId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...emptyUserWishlist, id: 'user-wishlist-raced' });
      wishlistRepositoryMock.assignWishlistToUser.mockResolvedValue(false);

      await service.mergeGuestWishlist('guest-token-1', 'user-uuid-1');

      expect(wishlistRepositoryMock.mergeGuestWishlistIntoUser).toHaveBeenCalledWith({
        userWishlistId: 'user-wishlist-raced',
        guestWishlistId: 'guest-wishlist-1',
        productIds: ['product-uuid-1', 'product-uuid-2'],
      });
    });

    it('merges unique products into an existing user wishlist (no duplicates) then deletes the guest list', async () => {
      wishlistRepositoryMock.findByToken.mockResolvedValue(guestWishlist);
      // User already saved product-uuid-1; the upsert in the repo dedupes it.
      wishlistRepositoryMock.findByUserId.mockResolvedValue({
        ...emptyUserWishlist,
        items: [buildItem('product-uuid-1', 'user-item-1')],
      });

      await service.mergeGuestWishlist('guest-token-1', 'user-uuid-1');

      expect(wishlistRepositoryMock.assignWishlistToUser).not.toHaveBeenCalled();
      expect(wishlistRepositoryMock.mergeGuestWishlistIntoUser).toHaveBeenCalledWith({
        userWishlistId: 'user-wishlist-1',
        guestWishlistId: 'guest-wishlist-1',
        productIds: ['product-uuid-1', 'product-uuid-2'],
      });
    });
  });
});
