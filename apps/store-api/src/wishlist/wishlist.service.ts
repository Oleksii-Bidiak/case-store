import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WishlistRepository } from './wishlist.repository';
import { WishlistEntity } from './entities';
import { AddToWishlistDto } from './dto';
import type { ResolvedWishlistIdentity } from './wishlist-identity.types';

/**
 * WishlistService — business logic for saved products / favorites.
 *
 * All methods accept a ResolvedWishlistIdentity (a user identity for
 * authenticated requests, or a token identity for guests) and return a
 * WishlistEntity. The service validates that a product exists before saving it
 * and delegates all database access to WishlistRepository. A wishlist is a set:
 * there is no quantity, and add/remove are idempotent.
 */
@Injectable()
export class WishlistService {
  private readonly logger = new Logger(WishlistService.name);

  constructor(private readonly wishlistRepository: WishlistRepository) {}

  /**
   * Get the current wishlist for the identity. Creates an empty one if none
   * exists.
   */
  async getWishlist(identity: ResolvedWishlistIdentity): Promise<WishlistEntity> {
    const wishlist = await this.wishlistRepository.findOrCreate(identity);
    return WishlistEntity.fromPrisma(wishlist);
  }

  /**
   * Add a product to the wishlist. Idempotent — re-adding a saved product is a
   * no-op (the repository upserts on the `(wishlistId, productId)` unique).
   */
  async add(identity: ResolvedWishlistIdentity, dto: AddToWishlistDto): Promise<WishlistEntity> {
    const wishlist = await this.wishlistRepository.findOrCreate(identity);

    await this.assertProductExists(dto.productId);

    const updated = await this.wishlistRepository.addItem(wishlist.id, dto.productId);
    return WishlistEntity.fromPrisma(updated);
  }

  /**
   * Remove a product from the wishlist. Idempotent — removing a product that is
   * not saved is a no-op. Creates the wishlist if the identity has none so the
   * response is always the (empty) current wishlist.
   */
  async remove(identity: ResolvedWishlistIdentity, productId: string): Promise<WishlistEntity> {
    const wishlist = await this.wishlistRepository.findOrCreate(identity);
    const updated = await this.wishlistRepository.removeItem(wishlist.id, productId);
    return WishlistEntity.fromPrisma(updated);
  }

  /**
   * Toggle a product in the wishlist: remove it when already saved, otherwise
   * add it. Returns the resulting wishlist so the client can reconcile state
   * from a single round-trip.
   */
  async toggle(identity: ResolvedWishlistIdentity, dto: AddToWishlistDto): Promise<WishlistEntity> {
    const wishlist = await this.wishlistRepository.findOrCreate(identity);

    const existing = await this.wishlistRepository.findItem(wishlist.id, dto.productId);

    if (existing) {
      const updated = await this.wishlistRepository.removeItem(wishlist.id, dto.productId);
      return WishlistEntity.fromPrisma(updated);
    }

    await this.assertProductExists(dto.productId);
    const updated = await this.wishlistRepository.addItem(wishlist.id, dto.productId);
    return WishlistEntity.fromPrisma(updated);
  }

  /**
   * Merge a guest wishlist (identified by token) into the user's wishlist on
   * login or registration. Saved products are de-duplicated via upsert; the
   * guest wishlist is deleted afterwards. A no-op when the guest wishlist is
   * missing or empty.
   *
   * Mirrors `CartService.mergeGuestCart`: reassign the guest list to the user
   * when they have none, otherwise merge unique products into the existing list
   * then delete the guest list — atomically. This must never throw in a way that
   * blocks authentication; the caller wraps it defensively.
   */
  async mergeGuestWishlist(guestToken: string, userId: string): Promise<void> {
    const guestWishlist = await this.wishlistRepository.findByToken(guestToken);

    if (!guestWishlist || guestWishlist.items.length === 0) {
      return;
    }

    let userWishlist = await this.wishlistRepository.findByUserId(userId);

    // No existing user wishlist → try to reassign the guest list to the user.
    if (!userWishlist) {
      const reassigned = await this.wishlistRepository.assignWishlistToUser(
        guestWishlist.id,
        userId,
      );
      if (reassigned) {
        return;
      }

      // Reassign hit the userId unique constraint: a user wishlist was created
      // concurrently (e.g. a parallel request/tab). Re-read it and merge into it.
      userWishlist = await this.wishlistRepository.findByUserId(userId);
      if (!userWishlist) {
        return;
      }
    }

    const productIds = guestWishlist.items.map((item) => item.productId);

    await this.wishlistRepository.mergeGuestWishlistIntoUser({
      userWishlistId: userWishlist.id,
      guestWishlistId: guestWishlist.id,
      productIds,
    });
  }

  /**
   * Ensure the product position exists before it is saved.
   *
   * @throws NotFoundException when the product does not exist
   */
  private async assertProductExists(productId: string): Promise<void> {
    const product = await this.wishlistRepository.findProductForWishlistValidation(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
  }
}
