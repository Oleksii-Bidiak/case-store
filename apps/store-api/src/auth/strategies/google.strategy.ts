import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { Request } from 'express';
import { GoogleOAuthStateStore } from '../oauth/google-oauth-state.store';
import { GoogleOAuthProfile } from '../oauth/google-oauth-profile';

/**
 * Google OAuth 2.0 strategy (TASK-168).
 *
 * Mirrors JwtAccessStrategy/JwtRefreshStrategy's shape: constructor reads
 * config, `validate()` normalizes the payload onto `request.user`.
 *
 * MUST be constructible even when Google credentials are absent —
 * passport-oauth2's constructor throws synchronously on falsy clientID/
 * clientSecret, and Nest eagerly instantiates every provider at module init,
 * so a real-or-nothing construction would crash AppModule bootstrap (breaking
 * every e2e test and local dev without Google env keys). Inert placeholder
 * fallbacks keep boot alive; the route-level GoogleAuthGuard is what actually
 * gates real use (503 when unconfigured).
 *
 * `validate()` is a deliberately thin, untested adapter (plan 153 §Testing
 * strategy): it is the one place the installed library's `Profile` shape
 * matters, and the TDD-covered business logic only ever sees the normalized
 * {@link GoogleOAuthProfile} seam it produces.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    configService: ConfigService,
    // Constructor param (not `this.x`) — needed before `super()` returns.
    stateStore: GoogleOAuthStateStore,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') || 'not-configured',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || 'not-configured',
      callbackURL:
        configService.get<string>('GOOGLE_CALLBACK_URL') ||
        'http://localhost:3001/api/auth/google/callback',
      scope: ['email', 'profile'],
      // Custom session-free state store — NOT `state: true`, which would
      // require req.session (no express-session in this app).
      store: stateStore,
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: Error | null, user?: GoogleOAuthProfile | false) => void,
  ): void {
    const primaryEmail = profile.emails?.[0];

    // The library's OIDC parser copies `email_verified` onto
    // `emails[0].verified` (boolean per Google's userinfo endpoint); older
    // profile shapes surface it only via `_json.email_verified`, and some
    // versions stringify it. Check all three defensively.
    const verifiedRaw = primaryEmail?.verified as boolean | string | undefined;
    const emailVerified =
      verifiedRaw === true ||
      verifiedRaw === 'true' ||
      (profile as unknown as { _json?: { email_verified?: boolean } })._json?.email_verified ===
        true;

    const normalized: GoogleOAuthProfile = {
      providerId: profile.id,
      email: primaryEmail?.value ?? null,
      emailVerified,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
      // Stashed by GoogleOAuthStateStore.verify() on the callback leg.
      redirect: req.oauthRedirect ?? '/',
    };

    done(null, normalized);
  }
}
