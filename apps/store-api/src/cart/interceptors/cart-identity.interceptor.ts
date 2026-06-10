import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import {
  buildCartTokenCookieOptions,
  CART_TOKEN_COOKIE,
  ResolvedCartIdentity,
} from '../cart-identity.types';

type RequestWithCartIdentity = Request & {
  cartIdentity?: ResolvedCartIdentity;
};

/**
 * Resolves the cart identity for the current request and attaches it to
 * `request.cartIdentity`:
 *
 * - Authenticated user (valid JWT) → `{ type: 'user', userId }`.
 * - Guest with a `cartToken` cookie → `{ type: 'token', token }`.
 * - Guest with no cookie → a new UUID token is generated, set as an HttpOnly
 *   cookie on the response, and used as the identity.
 *
 * Runs after the OptionalJwtAuthGuard (which populates `request.user`).
 */
@Injectable()
export class CartIdentityInterceptor implements NestInterceptor {
  constructor(private readonly configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithCartIdentity>();
    const response = http.getResponse<Response>();

    const user = request.user as { id?: string } | undefined;
    const userId = user?.id;

    if (userId) {
      request.cartIdentity = { type: 'user', userId };
      return next.handle();
    }

    const existingToken: string | undefined = request.cookies?.[CART_TOKEN_COOKIE];

    if (existingToken) {
      request.cartIdentity = { type: 'token', token: existingToken };
      return next.handle();
    }

    // No identity yet — issue a fresh guest token and set the cookie.
    const newToken = randomUUID();
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    response.cookie(CART_TOKEN_COOKIE, newToken, buildCartTokenCookieOptions(isProduction));
    request.cartIdentity = { type: 'token', token: newToken };

    return next.handle();
  }
}
