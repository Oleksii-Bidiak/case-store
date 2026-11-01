import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthSessionResponder } from './auth-session-responder';
import type { AuthService } from './auth.service';
import type { GuestStateMergeService } from './guest-state-merge.service';
import type { IssuedSession } from './entities';

/**
 * TASK-2010: the HTTP half of "you are now signed in", shared by every route that
 * opens a session — the auth routes AND the checkout sign-up on `POST /orders`
 * and `POST /orders/guest/:token/account`. One implementation, so the refresh
 * cookie can never be set with different attributes on a second door.
 */
describe('AuthSessionResponder', () => {
  const TTL = 7 * 24 * 60 * 60 * 1000;
  const session: IssuedSession = {
    userId: 'user-1',
    accessToken: 'access-token-value',
    refreshToken: 'refresh-token-value',
  };

  let guestStateMerge: { mergeInto: jest.Mock };
  let responder: AuthSessionResponder;

  const makeResponse = () => ({ cookie: jest.fn() });
  const withCookies = (cookies: Record<string, string>) => ({ cookies }) as unknown as Request;
  const cookieNames = (response: { cookie: jest.Mock }) =>
    response.cookie.mock.calls.map(([name]: [string]) => name);

  beforeEach(() => {
    guestStateMerge = {
      mergeInto: jest.fn().mockResolvedValue({ cartMerged: true, wishlistMerged: true }),
    };
    responder = new AuthSessionResponder(
      { refreshTokenTtlMs: TTL } as unknown as AuthService,
      { get: jest.fn().mockReturnValue('test') } as unknown as ConfigService,
      guestStateMerge as unknown as GuestStateMergeService,
    );
  });

  it('sets the refresh token as the HttpOnly, sameSite=strict, path-scoped cookie and hands back only the access token', async () => {
    const response = makeResponse();

    const body = await responder.attach(withCookies({}), response as unknown as Response, session);

    expect(body).toEqual({ accessToken: 'access-token-value' });
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token-value',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/api/auth/refresh',
        maxAge: TTL,
      }),
    );
  });

  it('merges the guest cart and wishlist into the session owner and clears their cookies', async () => {
    const response = makeResponse();

    await responder.attach(
      withCookies({ cartToken: 'cart-tok', wishlistToken: 'wish-tok' }),
      response as unknown as Response,
      session,
    );

    expect(guestStateMerge.mergeInto).toHaveBeenCalledWith('user-1', {
      cartToken: 'cart-tok',
      wishlistToken: 'wish-tok',
    });
    expect(cookieNames(response)).toEqual(['refreshToken', 'cartToken', 'wishlistToken']);
  });

  it('does not call the merge without guest cookies', async () => {
    await responder.attach(withCookies({}), makeResponse() as unknown as Response, session);

    expect(guestStateMerge.mergeInto).not.toHaveBeenCalled();
  });

  it('expires the refresh cookie with the attributes it was set with', () => {
    const response = makeResponse();

    responder.clearRefreshCookie(response as unknown as Response);

    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      '',
      expect.objectContaining({ httpOnly: true, path: '/api/auth/refresh', maxAge: 0 }),
    );
  });
});
