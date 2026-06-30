import { Injectable, Logger } from '@nestjs/common';
import { Prisma, WishlistItem } from '@prisma/client';
import { PrismaService } from '../prisma';
import type { ResolvedWishlistIdentity } from './wishlist-identity.types';

/**
 * Wishlist with its items and related product (position) details — the shape
 * returned by all wishlist queries. Includes the full item tree so the service
 * can map a `WishlistEntity` and the storefront can render product cards.
 */
export interface WishlistWithItems {
  id: string;
  userId: string | null;
  token: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    productId: string;
    createdAt: Date;
    product: {
      id: string;
      name: string;
      slug: string;
      price: { toString(): string };
      compareAtPrice: { toString(): string } | null;
      stock: number;
      isActive: boolean;
      images: Array<{ url: string }>;
    };
  }>;
}

/**
 * Shared Prisma include clause for wishlist queries. Fetches items newest-first
 * with their product (position) details, selecting the product `slug` and its
 * primary `images` entry (isPrimary-first, then sortOrder; `take: 1`) so each
 * saved product can render a thumbnail and link to the PDP without an extra
 * query. Mirrors the cart's `CART_ITEMS_INCLUDE`.
 */
const WISHLIST_ITEMS_INCLUDE = {
  items: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      productId: true,
      createdAt: true,
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          compareAtPrice: true,
          stock: true,
          isActive: true,
          images: {
            orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
            take: 1,
            select: { url: true },
          },
        },
      },
    },
  },
} satisfies Prisma.WishlistInclude;

@Injectable()
export class WishlistRepository {
  private readonly logger = new Logger(WishlistRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a wishlist by user ID, including all items with product details.
   * Returns null if the user has no wishlist.
   */
  findByUserId(userId: string): Promise<WishlistWithItems | null> {
    return this.prisma.wishlist.findUnique({
      where: { userId },
      include: WISHLIST_ITEMS_INCLUDE,
    }) as Promise<WishlistWithItems | null>;
  }

  /**
   * Find a guest wishlist by its opaque token, including all items.
   * Returns null if no wishlist exists for the token.
   */
  findByToken(token: string): Promise<WishlistWithItems | null> {
    return this.prisma.wishlist.findUnique({
      where: { token },
      include: WISHLIST_ITEMS_INCLUDE,
    }) as Promise<WishlistWithItems | null>;
  }

  /**
   * Find an existing wishlist for the given identity, or create one if it
   * doesn't exist. A user identity upserts by `userId`; a token identity upserts
   * by `token`. Uses upsert to avoid races between find and create.
   */
  findOrCreate(identity: ResolvedWishlistIdentity): Promise<WishlistWithItems> {
    const where =
      identity.type === 'user' ? { userId: identity.userId } : { token: identity.token };
    const create =
      identity.type === 'user' ? { userId: identity.userId } : { token: identity.token };

    return this.prisma.wishlist.upsert({
      where,
      update: {},
      create,
      include: WISHLIST_ITEMS_INCLUDE,
    }) as Promise<WishlistWithItems>;
  }

  /**
   * Add a product to a specific wishlist, returning the full updated wishlist.
   * Idempotent: a duplicate `(wishlistId, productId)` is swallowed via upsert,
   * so re-adding a saved product is a no-op rather than a unique-constraint
   * error.
   */
  async addItem(wishlistId: string, productId: string): Promise<WishlistWithItems> {
    await this.prisma.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId, productId } },
      update: {},
      create: { wishlistId, productId },
    });

    return this.prisma.wishlist.findUniqueOrThrow({
      where: { id: wishlistId },
      include: WISHLIST_ITEMS_INCLUDE,
    }) as Promise<WishlistWithItems>;
  }

  /**
   * Remove a product from a specific wishlist, returning the full updated
   * wishlist. Idempotent: `deleteMany` removes zero rows (no error) when the
   * product was not saved.
   */
  async removeItem(wishlistId: string, productId: string): Promise<WishlistWithItems> {
    await this.prisma.wishlistItem.deleteMany({
      where: { wishlistId, productId },
    });

    return this.prisma.wishlist.findUniqueOrThrow({
      where: { id: wishlistId },
      include: WISHLIST_ITEMS_INCLUDE,
    }) as Promise<WishlistWithItems>;
  }

  /**
   * Find a single wishlist item by wishlist ID and product ID. Used by the
   * service to decide whether a toggle adds or removes. Returns null if absent.
   */
  findItem(wishlistId: string, productId: string): Promise<WishlistItem | null> {
    return this.prisma.wishlistItem.findUnique({
      where: { wishlistId_productId: { wishlistId, productId } },
    });
  }

  /**
   * Assign a (guest) wishlist to a user, clearing its guest token. Used during
   * merge when the user has no pre-existing wishlist.
   *
   * Returns `false` when the user already owns a wishlist — a concurrent request
   * created one between the caller's lookup and this update (e.g. multi-tab
   * login), violating the `userId` unique constraint (Prisma P2002). The caller
   * then falls back to the item-by-item merge path.
   */
  async assignWishlistToUser(wishlistId: string, userId: string): Promise<boolean> {
    try {
      await this.prisma.wishlist.update({
        where: { id: wishlistId },
        data: { userId, token: null },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Atomically merge a set of product IDs into the user's wishlist and delete
   * the guest wishlist, in a single transaction. Either every product is saved
   * and the guest wishlist removed, or nothing changes — there is no
   * partially-merged state and no orphaned guest list left behind on failure.
   *
   * Each upsert is idempotent on `(wishlistId, productId)`, so products already
   * saved by the user are not duplicated.
   */
  async mergeGuestWishlistIntoUser(params: {
    userWishlistId: string;
    guestWishlistId: string;
    productIds: string[];
  }): Promise<void> {
    const { userWishlistId, guestWishlistId, productIds } = params;

    await this.prisma.$transaction(async (tx) => {
      for (const productId of productIds) {
        await tx.wishlistItem.upsert({
          where: { wishlistId_productId: { wishlistId: userWishlistId, productId } },
          update: {},
          create: { wishlistId: userWishlistId, productId },
        });
      }

      // Cascades to the guest wishlist's items via the schema relation.
      await tx.wishlist.delete({ where: { id: guestWishlistId } });
    });
  }

  /**
   * Check whether a product position exists, for validating an add request
   * before writing a wishlist item. Returns null when the product does not
   * exist. Wishlist-internal use only.
   */
  findProductForWishlistValidation(productId: string): Promise<{ id: string } | null> {
    return this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
  }
}
