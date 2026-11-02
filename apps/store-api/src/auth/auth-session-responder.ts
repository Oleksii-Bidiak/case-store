import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { GuestStateMergeService } from './guest-state-merge.service';
import type { IssuedSession } from './entities';
import {
  REFRESH_TOKEN_COOKIE,
  buildRefreshCookieOptions,
  expiredCookieOptions,
} from './auth-cookies';
import { CART_TOKEN_COOKIE, buildCartTokenCookieOptions } from '../cart';
import { WISHLIST_TOKEN_COOKIE, buildWishlistTokenCookieOptions } from '../wishlist';

/**
 * The HTTP half of "this request has just opened a session" (TASK-2010).
 *
 * Moved out of `AuthController` once a second module needed it: the checkout
 * sign-up (`POST /orders` with `contact.createAccount`, and
 * `POST /orders/guest/{token}/account`) signs the buyer in from the order
 * module. One implementation means the refresh cookie cannot be set with
 * different attributes on a second door — it is always the HttpOnly,
 * `sameSite=strict`, `/api/auth/refresh`-scoped cookie whose Max-Age is the
 * token's own lifetime (TASK-789) — and the guest cart/wishlist merge follows
 * every sign-in the same way (TASK-824).
 */
@Injectable()
export class AuthSessionResponder {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly guestStateMerge: GuestStateMergeService,
  ) {}

  /**
   * Set the refresh cookie, merge the request's guest cart and wishlist into the
   * session's owner, and return what the response body may carry — the access
   * token only. The refresh token never leaves the cookie.
   */
  async attach(
    request: Request,
    response: Response,
    session: IssuedSession,
  ): Promise<{ accessToken: string }> {
    this.setRefreshCookie(response, session.refreshToken);
    await this.mergeGuestState(request, response, session.userId);
    return { accessToken: session.accessToken };
  }

  /**
   * Set the refresh token as an HttpOnly cookie on the response, scoped to the
   * one route that reads it.
   */
  setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      // Max-Age = the token's own lifetime (TASK-789), never a constant.
      buildRefreshCookieOptions(this.isProduction(), this.authService.refreshTokenTtlMs),
    );
  }

  /** Expire the refresh cookie with the same attributes it was set with. */
  clearRefreshCookie(response: Response): void {
    response.cookie(
      REFRESH_TOKEN_COOKIE,
      '',
      expiredCookieOptions(buildRefreshCookieOptions(this.isProduction(), 0)),
    );
  }

  /**
   * Hand the request's guest cart and wishlist to {@link GuestStateMergeService}
   * and drop the cookie of each collection that actually merged (TASK-824).
   *
   * Only the HTTP half lives here — reading the cookies and clearing them. The
   * merge itself, and the rule that a failure never blocks sign-in, belong to
   * the service. A cookie is cleared ONLY for a merge that succeeded, so a
   * failed merge leaves the guest token in the browser for the next sign-in.
   *
   * Each guest cookie is expired with the options its own interceptor SET it
   * with, so the clear cannot drift from the set.
   *
   * `userId` comes from AuthService with the tokens (TASK-792) — not from
   * decoding the access token just minted, which is how an empty decode used to
   * clear the guest cookies without merging anything.
   */
  private async mergeGuestState(
    request: Request,
    response: Response,
    userId: string,
  ): Promise<void> {
    const cartToken: string | undefined = request.cookies?.[CART_TOKEN_COOKIE];
    const wishlistToken: string | undefined = request.cookies?.[WISHLIST_TOKEN_COOKIE];

    if (!cartToken && !wishlistToken) {
      return;
    }

    const { cartMerged, wishlistMerged } = await this.guestStateMerge.mergeInto(userId, {
      cartToken,
      wishlistToken,
    });

    if (cartMerged) {
      response.cookie(
        CART_TOKEN_COOKIE,
        '',
        expiredCookieOptions(buildCartTokenCookieOptions(this.isProduction())),
      );
    }

    if (wishlistMerged) {
      response.cookie(
        WISHLIST_TOKEN_COOKIE,
        '',
        expiredCookieOptions(buildWishlistTokenCookieOptions(this.isProduction())),
      );
    }
  }

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }
}
