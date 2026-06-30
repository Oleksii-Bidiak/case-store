import { Prisma } from '@prisma/client';
import { WishlistRepository, WishlistWithItems } from './wishlist.repository';
import { PrismaService } from '../prisma';
import type { ResolvedWishlistIdentity } from './wishlist-identity.types';

// ─── Mock PrismaService ──────────────────────────────────────────────────────

const prismaMock = {
  wishlist: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  wishlistItem: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  product: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ─── Test data ───────────────────────────────────────────────────────────────

const mockWishlist: WishlistWithItems = {
  id: 'wishlist-uuid-1',
  userId: 'user-uuid-1',
  token: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [
    {
      id: 'item-uuid-1',
      productId: 'product-uuid-1',
      createdAt: new Date(),
      product: {
        id: 'product-uuid-1',
        name: 'iPhone 15 Pro Case',
        slug: 'iphone-15-pro-case',
        price: { toString: () => '29.99' } as any,
        compareAtPrice: { toString: () => '39.99' } as any,
        stock: 50,
        isActive: true,
        images: [{ url: 'https://cdn.example.com/a.jpg' }],
      },
    },
  ],
};

describe('WishlistRepository', () => {
  let repository: WishlistRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new WishlistRepository(prismaMock as unknown as PrismaService);
  });

  describe('findOrCreate', () => {
    it('upserts by userId for a user identity', async () => {
      const identity: ResolvedWishlistIdentity = { type: 'user', userId: 'user-uuid-1' };
      prismaMock.wishlist.upsert.mockResolvedValue(mockWishlist);

      await repository.findOrCreate(identity);

      expect(prismaMock.wishlist.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-uuid-1' },
          create: { userId: 'user-uuid-1' },
        }),
      );
    });

    it('upserts by token for a guest identity', async () => {
      const identity: ResolvedWishlistIdentity = { type: 'token', token: 'guest-token-1' };
      prismaMock.wishlist.upsert.mockResolvedValue(mockWishlist);

      await repository.findOrCreate(identity);

      expect(prismaMock.wishlist.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { token: 'guest-token-1' },
          create: { token: 'guest-token-1' },
        }),
      );
    });
  });

  describe('addItem', () => {
    it('upserts the item idempotently on the compound unique then returns the wishlist', async () => {
      prismaMock.wishlistItem.upsert.mockResolvedValue({});
      prismaMock.wishlist.findUniqueOrThrow.mockResolvedValue(mockWishlist);

      const result = await repository.addItem('wishlist-uuid-1', 'product-uuid-1');

      expect(prismaMock.wishlistItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            wishlistId_productId: {
              wishlistId: 'wishlist-uuid-1',
              productId: 'product-uuid-1',
            },
          },
          update: {},
          create: { wishlistId: 'wishlist-uuid-1', productId: 'product-uuid-1' },
        }),
      );
      expect(result).toBe(mockWishlist);
    });
  });

  describe('removeItem', () => {
    it('deletes by wishlistId+productId (idempotent) then returns the wishlist', async () => {
      prismaMock.wishlistItem.deleteMany.mockResolvedValue({ count: 1 });
      prismaMock.wishlist.findUniqueOrThrow.mockResolvedValue(mockWishlist);

      await repository.removeItem('wishlist-uuid-1', 'product-uuid-1');

      expect(prismaMock.wishlistItem.deleteMany).toHaveBeenCalledWith({
        where: { wishlistId: 'wishlist-uuid-1', productId: 'product-uuid-1' },
      });
    });
  });

  describe('assignWishlistToUser', () => {
    it('returns true when the update succeeds', async () => {
      prismaMock.wishlist.update.mockResolvedValue(mockWishlist);

      const result = await repository.assignWishlistToUser('guest-1', 'user-uuid-1');

      expect(result).toBe(true);
      expect(prismaMock.wishlist.update).toHaveBeenCalledWith({
        where: { id: 'guest-1' },
        data: { userId: 'user-uuid-1', token: null },
      });
    });

    it('returns false on a P2002 unique conflict (user already owns a wishlist)', async () => {
      const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prismaMock.wishlist.update.mockRejectedValue(conflict);

      const result = await repository.assignWishlistToUser('guest-1', 'user-uuid-1');

      expect(result).toBe(false);
    });

    it('rethrows non-P2002 errors', async () => {
      prismaMock.wishlist.update.mockRejectedValue(new Error('boom'));

      await expect(repository.assignWishlistToUser('guest-1', 'user-uuid-1')).rejects.toThrow(
        'boom',
      );
    });
  });

  describe('mergeGuestWishlistIntoUser', () => {
    it('upserts each product id then deletes the guest wishlist in a transaction', async () => {
      const tx = {
        wishlistItem: { upsert: jest.fn().mockResolvedValue({}) },
        wishlist: { delete: jest.fn().mockResolvedValue({}) },
      };
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await repository.mergeGuestWishlistIntoUser({
        userWishlistId: 'user-w-1',
        guestWishlistId: 'guest-w-1',
        productIds: ['p1', 'p2'],
      });

      expect(tx.wishlistItem.upsert).toHaveBeenCalledTimes(2);
      expect(tx.wishlistItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { wishlistId_productId: { wishlistId: 'user-w-1', productId: 'p1' } },
          create: { wishlistId: 'user-w-1', productId: 'p1' },
        }),
      );
      expect(tx.wishlist.delete).toHaveBeenCalledWith({ where: { id: 'guest-w-1' } });
    });
  });
});
