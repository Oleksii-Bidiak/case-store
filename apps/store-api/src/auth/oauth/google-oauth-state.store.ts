import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { Request } from 'express';
import { sanitizeRedirectTarget } from './sanitize-redirect-target';

/** Lifetime of the OAuth `state` token — the user has this long to complete
 * Google's consent screen before the round trip is rejected. */
const OAUTH_STATE_TTL = '10m';

/**
 * Session-free OAuth 2.0 `state` store (TASK-168).
 *
 * Google's `state` parameter is this codebase's per-request CSRF token for
 * the OAuth flow (RFC 6749 §10.12). `passport-oauth2`'s default `state: true`
 * behavior requires `req.session`, which this stateless-JWT app doesn't have.
 * Instead of adding express-session for one flow, this class implements
 * `passport-oauth2`'s documented `{ store(req, cb), verify(req, state, cb) }`
 * store interface backed by a short-lived signed JWT.
 *
 * Signed with the existing JWT_SECRET (already required, ≥32 chars) — the
 * payload shape `{ nonce, redirect }` never collides with an access/refresh
 * token's `{ sub, role }` shape, so even a hypothetical cross-use attempt
 * fails every downstream guard's field checks harmlessly.
 */
@Injectable()
export class GoogleOAuthStateStore {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Leg 1 (GET /auth/google): mint the state value Google will echo back
   * verbatim in the callback's `?state=`. The (sanitized) `?redirect=` target
   * rides inside the signed payload so it survives the round trip untampered.
   */
  store(req: Request, callback: (err: Error | null, state?: string) => void): void {
    const redirect = sanitizeRedirectTarget(req.query.redirect as string | undefined);
    const nonce = randomBytes(16).toString('hex');

    const state = this.jwtService.sign(
      { nonce, redirect },
      {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: OAUTH_STATE_TTL,
      },
    );

    callback(null, state);
  }

  /**
   * Leg 2 (GET /auth/google/callback): verify Google's echoed `state` is a
   * signature-valid, unexpired token WE minted. On success the decoded
   * redirect target is stashed on `req.oauthRedirect` (same "stash on req for
   * the Strategy to read" pattern JwtRefreshStrategy uses for
   * `req._refreshToken`) — the store callback shape has no other channel back
   * to `GoogleStrategy.validate()`.
   */
  verify(
    req: Request,
    providedState: string,
    callback: (err: Error | null, ok?: boolean, info?: { message: string }) => void,
  ): void {
    try {
      const decoded = this.jwtService.verify<{ nonce: string; redirect: string }>(providedState, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      // Defense in depth: the state is server-signed so this re-sanitize is
      // mostly redundant, but it means a future bug in the signing step can't
      // reintroduce an open redirect.
      req.oauthRedirect = sanitizeRedirectTarget(decoded.redirect);
      callback(null, true);
    } catch {
      callback(null, false, { message: 'Invalid or expired OAuth state' });
    }
  }
}

// Extend Express Request with the OAuth redirect stash (TASK-168) — mirrors
// the `_refreshToken` augmentation in jwt-refresh.strategy.ts.
declare module 'express' {
  interface Request {
    oauthRedirect?: string;
  }
}
