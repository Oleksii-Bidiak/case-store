import { PinoLogger } from 'nestjs-pino';
import { CartService } from '../cart/cart.service';
import { WishlistService } from '../wishlist/wishlist.service';
import { GuestStateMergeService } from './guest-state-merge.service';

/**
 * TASK-824 moved the guest merge out of AuthController; TASK-792 is the rule it
 * must keep: a cookie may be dropped only for a merge that actually happened.
 */
describe('GuestStateMergeService', () => {
  let cartService: { mergeGuestCart: jest.Mock };
  let wishlistService: { mergeGuestWishlist: jest.Mock };
  let logger: { setContext: jest.Mock; error: jest.Mock };
  let service: GuestStateMergeService;

  beforeEach(() => {
    cartService = { mergeGuestCart: jest.fn().mockResolvedValue(undefined) };
    wishlistService = { mergeGuestWishlist: jest.fn().mockResolvedValue(undefined) };
    logger = { setContext: jest.fn(), error: jest.fn() };
    service = new GuestStateMergeService(
      cartService as unknown as CartService,
      wishlistService as unknown as WishlistService,
      logger as unknown as PinoLogger,
    );
  });

  it('merges both collections into the given user and reports both merged', async () => {
    const outcome = await service.mergeInto('user-1', {
      cartToken: 'cart-tok',
      wishlistToken: 'wish-tok',
    });

    expect(cartService.mergeGuestCart).toHaveBeenCalledWith('cart-tok', 'user-1');
    expect(wishlistService.mergeGuestWishlist).toHaveBeenCalledWith('wish-tok', 'user-1');
    expect(outcome).toEqual({ cartMerged: true, wishlistMerged: true });
  });

  it('touches nothing and reports nothing merged when there are no guest tokens', async () => {
    const outcome = await service.mergeInto('user-1', {});

    expect(cartService.mergeGuestCart).not.toHaveBeenCalled();
    expect(wishlistService.mergeGuestWishlist).not.toHaveBeenCalled();
    expect(outcome).toEqual({ cartMerged: false, wishlistMerged: false });
  });

  it('reports a failed cart merge as NOT merged, logs it, and still merges the wishlist', async () => {
    cartService.mergeGuestCart.mockRejectedValue(new Error('db down'));

    const outcome = await service.mergeInto('user-1', {
      cartToken: 'cart-tok',
      wishlistToken: 'wish-tok',
    });

    expect(outcome).toEqual({ cartMerged: false, wishlistMerged: true });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.guestMergeFailed', collection: 'cart' }),
      expect.any(String),
    );
  });

  it('reports a failed wishlist merge as NOT merged without failing the call', async () => {
    wishlistService.mergeGuestWishlist.mockRejectedValue(new Error('db down'));

    await expect(
      service.mergeInto('user-1', { cartToken: 'cart-tok', wishlistToken: 'wish-tok' }),
    ).resolves.toEqual({ cartMerged: true, wishlistMerged: false });
  });

  it('never writes the guest token into the log', async () => {
    cartService.mergeGuestCart.mockRejectedValue(new Error('db down'));

    await service.mergeInto('user-1', { cartToken: 'secret-cart-tok' });

    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('secret-cart-tok');
  });
});
