import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { createCsrfToken, isValidCsrfToken, safeEqual } from './csrf.util';
import {
  CSRF_COOKIE_DEV,
  CSRF_COOKIE_PROD,
  CSRF_DEV_FALLBACK_SECRET,
  CSRF_HEADER,
  CSRF_SAFE_METHODS,
  CSRF_SECRET_MIN_LENGTH,
} from './csrf.constants';

/**
 * Signed double-submit CSRF protection.
 *
 * Used two ways:
 * - `issueToken(res)` — mints a token, sets it as a readable cookie, and returns
 *   it (the `GET /api/csrf-token` endpoint and the safe-method bootstrap path).
 * - `protect` — an Express middleware (bound method) mounted in `main.ts` on the
 *   cookie-authenticated, state-changing routes. It validates that the
 *   `x-csrf-token` header matches the CSRF cookie and carries a valid signature.
 *
 * The middleware is applied via `app.use()` at the Express layer, which runs
 * before Nest's exception filter — so on failure it writes the standard error
 * envelope directly rather than throwing.
 */
@Injectable()
export class CsrfService {
  private readonly logger = new Logger(CsrfService.name);
  private readonly isProduction: boolean;
  private readonly secret: string;

  constructor(private readonly configService: ConfigService) {
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    const configured = this.configService.get<string>('CSRF_SECRET');

    // Fail fast in production: the fallback secret is public (it lives in this
    // repository), so signing tokens with it lets anyone forge a valid CSRF
    // token and defeat the double-submit check entirely. `env.validation.ts`
    // enforces the same rule at boot; this guard also covers a CsrfService built
    // outside that ConfigModule validation.
    if (this.isProduction && (!configured || configured.length < CSRF_SECRET_MIN_LENGTH)) {
      throw new Error(
        `CSRF_SECRET must be set to at least ${CSRF_SECRET_MIN_LENGTH} characters in production`,
      );
    }
    if (!configured) {
      this.logger.warn(
        'CSRF_SECRET is not set — signing CSRF tokens with the development fallback secret.',
      );
    }
    this.secret = configured ?? CSRF_DEV_FALLBACK_SECRET;
  }

  /** The cookie name for the current environment. */
  get cookieName(): string {
    return this.isProduction ? CSRF_COOKIE_PROD : CSRF_COOKIE_DEV;
  }

  /**
   * Mint a CSRF token, set it as a non-HttpOnly cookie (so the frontend JS can
   * read it and echo it back), and return the token value.
   */
  issueToken(res: Response): string {
    const token = createCsrfToken(this.secret);
    res.cookie(this.cookieName, token, {
      httpOnly: false, // must be readable by frontend JS to forward as a header
      sameSite: 'strict',
      secure: this.isProduction,
      path: '/',
    });
    return token;
  }

  /**
   * Express middleware enforcing CSRF on state-changing requests.
   *
   * Bound as an arrow property so it can be passed directly to `app.use()`
   * without losing `this`.
   */
  readonly protect = (req: Request, res: Response, next: NextFunction): void => {
    const method = (req.method ?? 'GET').toUpperCase();

    // Bearer-authenticated requests are not CSRF-vulnerable: a browser cannot
    // attach an Authorization header to a cross-site request (it forces a
    // preflight that the CORS allowlist blocks). Only cookie-only requests
    // (guest cart, refresh-token rotation) need the CSRF check.
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    // Safe methods never mutate state. Bootstrap the cookie here if absent so a
    // plain GET (e.g. GET /api/cart on page load) primes the token for the
    // subsequent mutation, then continue.
    if (CSRF_SAFE_METHODS.has(method)) {
      const existing = (req.cookies as Record<string, string> | undefined)?.[this.cookieName];
      if (!existing) {
        this.issueToken(res);
      }
      next();
      return;
    }

    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[this.cookieName];
    const headerValue = req.headers[CSRF_HEADER];
    const headerToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (
      !cookieToken ||
      !headerToken ||
      !safeEqual(cookieToken, headerToken) ||
      !isValidCsrfToken(headerToken, this.secret)
    ) {
      this.reject(req, res);
      return;
    }

    next();
  };

  /**
   * Throw a ForbiddenException — exposed for unit testing the rejection path
   * without an Express response. The middleware itself writes the envelope
   * directly (see `reject`).
   */
  assertValid(cookieToken?: string, headerToken?: string): void {
    if (
      !cookieToken ||
      !headerToken ||
      !safeEqual(cookieToken, headerToken) ||
      !isValidCsrfToken(headerToken, this.secret)
    ) {
      throw new ForbiddenException('Invalid CSRF token');
    }
  }

  private reject(req: Request, res: Response): void {
    res.status(403).json({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Invalid CSRF token',
      timestamp: new Date().toISOString(),
      path: req.originalUrl ?? req.url,
    });
  }
}
