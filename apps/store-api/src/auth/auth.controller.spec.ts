import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokens } from './entities';
import { GoogleOAuthProfile } from './oauth/google-oauth-profile';
import { CartService } from '../cart/cart.service';
import { WishlistService } from '../wishlist/wishlist.service';

/**
 * TASK-168 (plan 153 §Migration step 7).
 *
 * Controller-level redirect contract for the Google OAuth callback: success
 * lands on STORE_CLIENT_URL + the state-carried redirect (refresh cookie
 * set, NO token anywhere in the URL); every failure — Google-side denial
 * (no profile) or an AuthService rejection (unverified email / locked
 * account) — funnels to the single fixed /login?oauthError=1 target.
 */
describe('AuthController — google oauth callback', () => {
  let controller: AuthController;
  let authService: { loginWithGoogleProfile: jest.Mock };

  const testConfig: Record<string, string> = {
    STORE_CLIENT_URL: 'http://localhost:3000',
  };

  const makeResponse = (): jest.Mocked<Pick<Response, 'redirect' | 'cookie'>> =>
    ({
      redirect: jest.fn(),
      cookie: jest.fn(),
    }) as unknown as jest.Mocked<Pick<Response, 'redirect' | 'cookie'>>;

  const makeRequest = (): Request => ({ cookies: {} }) as unknown as Request;

  const googleProfile: GoogleOAuthProfile = {
    providerId: 'google-sub-123',
    email: 'test@example.com',
    emailVerified: true,
    firstName: 'John',
    lastName: 'Doe',
    redirect: '/checkout',
  };

  beforeEach(() => {
    authService = {
      loginWithGoogleProfile: jest.fn(),
    };

    const configMock = {
      get: jest.fn((key: string, defaultValue?: string) => testConfig[key] ?? defaultValue),
    };

    const jwtServiceMock = { decode: jest.fn() };
    const cartServiceMock = { mergeGuestCart: jest.fn() };
    const wishlistServiceMock = { mergeGuestWishlist: jest.fn() };

    controller = new AuthController(
      authService as unknown as AuthService,
      configMock as unknown as ConfigService,
      jwtServiceMock as unknown as JwtService,
      cartServiceMock as unknown as CartService,
      wishlistServiceMock as unknown as WishlistService,
    );
  });

  it('redirects to the state-carried target with the refresh cookie set on success', async () => {
    const tokens = new AuthTokens();
    tokens.accessToken = 'access-token-value';
    tokens.refreshToken = 'refresh-token-value';
    authService.loginWithGoogleProfile.mockResolvedValue(tokens);

    const response = makeResponse();

    await controller.googleAuthCallback(
      googleProfile,
      makeRequest(),
      response as unknown as Response,
    );

    expect(authService.loginWithGoogleProfile).toHaveBeenCalledWith(googleProfile);

    // Refresh cookie set exactly like every other auth flow.
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token-value',
      expect.objectContaining({ httpOnly: true, path: '/api/auth/refresh' }),
    );

    // Success redirect — and NO token anywhere in the URL.
    expect(response.redirect).toHaveBeenCalledWith(302, 'http://localhost:3000/checkout');
    const [, location] = response.redirect.mock.calls[0];
    expect(location).not.toContain('access-token-value');
    expect(location).not.toContain('refresh-token-value');
  });

  it('redirects to the fixed failure target when Google denied (no profile)', async () => {
    const response = makeResponse();

    await controller.googleAuthCallback(undefined, makeRequest(), response as unknown as Response);

    expect(response.redirect).toHaveBeenCalledWith(302, 'http://localhost:3000/login?oauthError=1');
    expect(authService.loginWithGoogleProfile).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('redirects to the same fixed failure target when the service rejects', async () => {
    // Unverified email and locked account both surface here identically —
    // no reason code ever reaches the URL.
    authService.loginWithGoogleProfile.mockRejectedValue(new Error('rejected'));

    const response = makeResponse();

    await controller.googleAuthCallback(
      googleProfile,
      makeRequest(),
      response as unknown as Response,
    );

    expect(response.redirect).toHaveBeenCalledWith(302, 'http://localhost:3000/login?oauthError=1');
    expect(response.cookie).not.toHaveBeenCalled();
  });
});
