import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CartService } from '../cart/cart.service';
import { WishlistService } from '../wishlist/wishlist.service';

/** The guest tokens a request arrived with — either may be absent. */
export interface GuestStateTokens {
  cartToken?: string;
  wishlistToken?: string;
}

/**
 * What happened to each guest collection. `true` means the guest state is now
 * the account's and its cookie can be dropped; `false` means there was nothing
 * to merge OR the merge failed — in both cases the cookie must stay.
 */
export interface GuestStateMergeOutcome {
  cartMerged: boolean;
  wishlistMerged: boolean;
}

/**
 * Moves a guest's cart and wishlist onto the account that has just signed in
 * (TASK-824).
 *
 * This used to be ninety lines of `AuthController` — business logic in the HTTP
 * layer, twice, once per collection. The controller now keeps only what is
 * HTTP: reading the cookies and clearing the ones this service reports merged.
 *
 * ── The contract, unchanged from the controller version ─────────────────────
 *
 *   - A merge failure never blocks authentication. It is logged and reported
 *     as "not merged"; the sign-in carries on.
 *   - A cookie is dropped ONLY after its own merge succeeded (TASK-792). A
 *     transient failure therefore leaves the guest token in the browser, and
 *     the guest cart or wishlist is still there to merge on the next sign-in —
 *     instead of being orphaned by a cookie cleared on the way out.
 *   - The two collections are independent: a failed cart merge does not stop
 *     the wishlist from merging, and vice versa.
 */
@Injectable()
export class GuestStateMergeService {
  constructor(
    private readonly cartService: CartService,
    private readonly wishlistService: WishlistService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GuestStateMergeService.name);
  }

  async mergeInto(userId: string, tokens: GuestStateTokens): Promise<GuestStateMergeOutcome> {
    const cartMerged = await this.attempt(tokens.cartToken, 'cart', (token) =>
      this.cartService.mergeGuestCart(token, userId),
    );
    const wishlistMerged = await this.attempt(tokens.wishlistToken, 'wishlist', (token) =>
      this.wishlistService.mergeGuestWishlist(token, userId),
    );

    return { cartMerged, wishlistMerged };
  }

  private async attempt(
    token: string | undefined,
    collection: 'cart' | 'wishlist',
    merge: (token: string) => Promise<void>,
  ): Promise<boolean> {
    if (!token) {
      return false;
    }

    try {
      await merge(token);
      return true;
    } catch (err) {
      // Never log the guest token: it is a bearer credential for the guest
      // cart until the cookie expires.
      this.logger.error(
        { event: 'auth.guestMergeFailed', collection, err },
        `Guest ${collection} merge on authentication failed`,
      );
      return false;
    }
  }
}
