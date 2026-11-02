import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { IssuedSession } from './entities';
import { GoogleOAuthProfile } from './oauth/google-oauth-profile';
import { GuestStateMergeService } from './guest-state-merge.service';
import { PermissionService } from './permissions';
import { EmailVerificationService } from './email-verification.service';
import { EmailChangeService } from './email-change.service';
import { AuthSessionResponder } from './auth-session-responder';
import { CheckoutAccountService } from './checkout-account.service';

// Constructor collaborators the routes under test never reach.
const untouchedCollaborators = [
  {} as PermissionService,
  {} as EmailVerificationService,
  {} as EmailChangeService,
  {} as CheckoutAccountService,
] as const;

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
  let authService: { loginWithGoogleProfile: jest.Mock; refreshTokenTtlMs: number };

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
      // 30 days — anything but the old hard-coded seven (TASK-789).
      refreshTokenTtlMs: 30 * 24 * 60 * 60 * 1000,
    };

    const configMock = {
      get: jest.fn((key: string, defaultValue?: string) => testConfig[key] ?? defaultValue),
    };

    const guestStateMergeMock = {
      mergeInto: jest.fn().mockResolvedValue({ cartMerged: false, wishlistMerged: false }),
    };

    controller = new AuthController(
      authService as unknown as AuthService,
      configMock as unknown as ConfigService,
      new AuthSessionResponder(
        authService as unknown as AuthService,
        configMock as unknown as ConfigService,
        guestStateMergeMock as unknown as GuestStateMergeService,
      ),
      ...untouchedCollaborators,
    );
  });

  it('redirects to the state-carried target with the refresh cookie set on success', async () => {
    const tokens: IssuedSession = {
      userId: 'user-google-1',
      accessToken: 'access-token-value',
      refreshToken: 'refresh-token-value',
    };
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
      expect.objectContaining({
        httpOnly: true,
        path: '/api/auth/refresh',
        // Max-Age is the refresh token's configured lifetime (TASK-789).
        maxAge: 30 * 24 * 60 * 60 * 1000,
      }),
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

/**
 * TASK-792: the guest cookies are dropped ONLY for a merge that succeeded, and
 * the user the guest state merges into is the one AuthService reports — the
 * controller no longer decodes a token to find out.
 */
describe('AuthController — guest state on login', () => {
  const session: IssuedSession = {
    userId: 'user-from-service',
    accessToken: 'opaque-access-token',
    refreshToken: 'refresh-token-value',
  };

  let authService: { login: jest.Mock; refreshTokenTtlMs: number };
  let guestStateMerge: { mergeInto: jest.Mock };
  let controller: AuthController;

  const makeResponse = () => ({ cookie: jest.fn() });
  const withCookies = (cookies: Record<string, string>) => ({ cookies }) as unknown as Request;
  const cookieNames = (response: { cookie: jest.Mock }) =>
    response.cookie.mock.calls.map(([name]: [string]) => name);

  beforeEach(() => {
    authService = {
      login: jest.fn().mockResolvedValue(session),
      refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
    };
    guestStateMerge = { mergeInto: jest.fn() };
    const config = { get: jest.fn() } as unknown as ConfigService;
    controller = new AuthController(
      authService as unknown as AuthService,
      config,
      new AuthSessionResponder(
        authService as unknown as AuthService,
        config,
        guestStateMerge as unknown as GuestStateMergeService,
      ),
      ...untouchedCollaborators,
    );
  });

  it('merges into the userId returned by the service, not one decoded from a token', async () => {
    guestStateMerge.mergeInto.mockResolvedValue({ cartMerged: true, wishlistMerged: true });

    await controller.login(
      { email: 'a@example.com', password: 'x' },
      withCookies({ cartToken: 'cart-tok', wishlistToken: 'wish-tok' }),
      makeResponse() as unknown as Response,
    );

    expect(guestStateMerge.mergeInto).toHaveBeenCalledWith('user-from-service', {
      cartToken: 'cart-tok',
      wishlistToken: 'wish-tok',
    });
  });

  it('clears both guest cookies after both merges succeed', async () => {
    guestStateMerge.mergeInto.mockResolvedValue({ cartMerged: true, wishlistMerged: true });
    const response = makeResponse();

    await controller.login(
      { email: 'a@example.com', password: 'x' },
      withCookies({ cartToken: 'cart-tok', wishlistToken: 'wish-tok' }),
      response as unknown as Response,
    );

    expect(cookieNames(response)).toEqual(['refreshToken', 'cartToken', 'wishlistToken']);
    expect(response.cookie).toHaveBeenCalledWith(
      'cartToken',
      '',
      expect.objectContaining({ maxAge: 0, path: '/api' }),
    );
  });

  it('keeps the cart cookie when the cart merge failed, and still clears the merged wishlist', async () => {
    guestStateMerge.mergeInto.mockResolvedValue({ cartMerged: false, wishlistMerged: true });
    const response = makeResponse();

    await controller.login(
      { email: 'a@example.com', password: 'x' },
      withCookies({ cartToken: 'cart-tok', wishlistToken: 'wish-tok' }),
      response as unknown as Response,
    );

    expect(cookieNames(response)).toEqual(['refreshToken', 'wishlistToken']);
  });

  it('does not call the merge at all without guest cookies', async () => {
    await controller.login(
      { email: 'a@example.com', password: 'x' },
      withCookies({}),
      makeResponse() as unknown as Response,
    );

    expect(guestStateMerge.mergeInto).not.toHaveBeenCalled();
  });
});

/**
 * TASK-2010: the two public routes of the checkout sign-up on the auth side —
 * finishing the account from the «Задайте пароль» letter, and the early
 * "this address already has an account" signal for the checkout form.
 */
describe('AuthController — checkout sign-up routes (TASK-2010)', () => {
  const session: IssuedSession = {
    userId: 'user-1',
    accessToken: 'opaque-access-token',
    refreshToken: 'refresh-token-value',
  };

  let checkoutAccounts: { confirmSetup: jest.Mock; hasAccount: jest.Mock };
  let confirmEmailVerification: jest.Mock;
  let controller: AuthController;

  beforeEach(() => {
    confirmEmailVerification = jest.fn();
    const authService = {
      refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
      confirmEmailVerification,
    } as unknown as AuthService;
    const config = { get: jest.fn() } as unknown as ConfigService;
    checkoutAccounts = {
      confirmSetup: jest.fn().mockResolvedValue({ session, claimedOrders: 2 }),
      hasAccount: jest.fn(),
    };
    controller = new AuthController(
      authService,
      config,
      new AuthSessionResponder(authService, config, {
        mergeInto: jest.fn(),
      } as unknown as GuestStateMergeService),
      {} as PermissionService,
      {} as EmailVerificationService,
      {} as EmailChangeService,
      checkoutAccounts as unknown as CheckoutAccountService,
    );
  });

  it('account-setup/confirm opens a session on this device and reports the claimed orders', async () => {
    const response = { cookie: jest.fn() };

    const result = await controller.confirmAccountSetup(
      { token: 'raw', password: 'newpassword1' },
      { cookies: {} } as unknown as Request,
      response as unknown as Response,
    );

    expect(checkoutAccounts.confirmSetup).toHaveBeenCalledWith('raw', 'newpassword1');
    expect(result).toEqual({ data: { accessToken: 'opaque-access-token', claimedOrders: 2 } });
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token-value',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
    );
  });

  it('email/verify/confirm signs a password-less clicker in on this device (TASK-2362)', async () => {
    confirmEmailVerification.mockResolvedValue({ claimedOrders: 1, session });
    const response = { cookie: jest.fn() };

    const result = await controller.confirmEmailVerification(
      { token: 'raw' },
      undefined,
      { cookies: {} } as unknown as Request,
      response as unknown as Response,
    );

    expect(confirmEmailVerification).toHaveBeenCalledWith('raw', null);
    expect(result).toEqual({
      data: {
        message: 'Email address verified.',
        claimedOrders: 1,
        session: { accessToken: 'opaque-access-token' },
      },
    });
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token-value',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('email/verify/confirm passes the signed-in caller and sets no cookie when no session is minted', async () => {
    confirmEmailVerification.mockResolvedValue({ claimedOrders: 0, session: null });
    const response = { cookie: jest.fn() };

    const result = await controller.confirmEmailVerification(
      { token: 'raw' },
      'user-1',
      { cookies: {} } as unknown as Request,
      response as unknown as Response,
    );

    expect(confirmEmailVerification).toHaveBeenCalledWith('raw', 'user-1');
    expect(result).toEqual({ data: { message: 'Email address verified.', claimedOrders: 0 } });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('checkout/email-status answers whether the address already has an account', async () => {
    checkoutAccounts.hasAccount.mockResolvedValue(true);

    await expect(controller.checkoutEmailStatus({ email: 'a@example.com' })).resolves.toEqual({
      data: { hasAccount: true },
    });
    expect(checkoutAccounts.hasAccount).toHaveBeenCalledWith('a@example.com');
  });
});
