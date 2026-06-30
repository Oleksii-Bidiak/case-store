import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import {
  buildWishlistTokenCookieOptions,
  WISHLIST_TOKEN_COOKIE,
  ResolvedWishlistIdentity,
} from '../wishlist-identity.types';

type RequestWithWishlistIdentity = Request & {
  wishlistIdentity?: ResolvedWishlistIdentity;
};

/**
 * Resolves the wishlist identity for the current request and attaches it to
 * `request.wishlistIdentity`:
 *
 * - Authenticated user (valid JWT) → `{ type: 'user', userId }`.
 * - Guest with a `wishlistToken` cookie → `{ type: 'token', token }`.
 * - Guest with no cookie → a new UUID token is generated, set as an HttpOnly
 *   cookie on the response, and used as the identity.
 *
 * Runs after the OptionalJwtAuthGuard (which populates `request.user`). Parallel
 * copy of the cart's CartIdentityInterceptor with a distinct cookie name.
 */
@Injectable()
export class WishlistIdentityInterceptor implements NestInterceptor {
  constructor(private readonly configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithWishlistIdentity>();
    const response = http.getResponse<Response>();

    const user = request.user as { id?: string } | undefined;
    const userId = user?.id;

    if (userId) {
      request.wishlistIdentity = { type: 'user', userId };
      return next.handle();
    }

    const existingToken: string | undefined = request.cookies?.[WISHLIST_TOKEN_COOKIE];

    if (existingToken) {
      request.wishlistIdentity = { type: 'token', token: existingToken };
      return next.handle();
    }

    // No identity yet — issue a fresh guest token and set the cookie.
    const newToken = randomUUID();
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    response.cookie(WISHLIST_TOKEN_COOKIE, newToken, buildWishlistTokenCookieOptions(isProduction));
    request.wishlistIdentity = { type: 'token', token: newToken };

    return next.handle();
  }
}
