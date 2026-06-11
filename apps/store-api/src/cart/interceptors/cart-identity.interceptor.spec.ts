import { ExecutionContext, CallHandler } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { CartIdentityInterceptor } from './cart-identity.interceptor';
import { CART_TOKEN_COOKIE } from '../cart-identity.types';

/**
 * Unit tests for CartIdentityInterceptor — the identity resolution that sets
 * request.cartIdentity and issues a guest cartToken cookie when needed.
 */
describe('CartIdentityInterceptor', () => {
  let interceptor: CartIdentityInterceptor;
  const configService = { get: jest.fn().mockReturnValue('test') } as unknown as ConfigService;

  const makeNext = (): CallHandler => ({ handle: jest.fn().mockReturnValue(of('result')) });

  const makeContext = (
    request: Record<string, unknown>,
    response: Record<string, unknown>,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    interceptor = new CartIdentityInterceptor(configService);
  });

  it('resolves a user identity from request.user and does not touch the cookie', () => {
    const request: Record<string, unknown> = { user: { id: 'user-1' }, cookies: {} };
    const response = { cookie: jest.fn() };

    interceptor.intercept(makeContext(request, response), makeNext());

    expect(request.cartIdentity).toEqual({ type: 'user', userId: 'user-1' });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('prefers the user identity even when a stale cartToken cookie is present', () => {
    const request: Record<string, unknown> = {
      user: { id: 'user-2' },
      cookies: { [CART_TOKEN_COOKIE]: 'stale-token' },
    };
    const response = { cookie: jest.fn() };

    interceptor.intercept(makeContext(request, response), makeNext());

    expect(request.cartIdentity).toEqual({ type: 'user', userId: 'user-2' });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('reuses an existing guest cartToken cookie without issuing a new one', () => {
    const request: Record<string, unknown> = {
      user: null,
      cookies: { [CART_TOKEN_COOKIE]: 'existing-token' },
    };
    const response = { cookie: jest.fn() };

    interceptor.intercept(makeContext(request, response), makeNext());

    expect(request.cartIdentity).toEqual({ type: 'token', token: 'existing-token' });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('issues a fresh HttpOnly cartToken cookie when a guest has none', () => {
    const request: Record<string, unknown> = { user: null, cookies: {} };
    const response = { cookie: jest.fn() };

    interceptor.intercept(makeContext(request, response), makeNext());

    const identity = request.cartIdentity as { type: string; token: string };
    expect(identity.type).toBe('token');
    expect(typeof identity.token).toBe('string');
    expect(identity.token.length).toBeGreaterThan(0);

    expect(response.cookie).toHaveBeenCalledWith(
      CART_TOKEN_COOKIE,
      identity.token,
      expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api' }),
    );
  });

  it('continues the request pipeline (calls next.handle)', () => {
    const request: Record<string, unknown> = { user: { id: 'user-1' }, cookies: {} };
    const response = { cookie: jest.fn() };
    const next = makeNext();

    interceptor.intercept(makeContext(request, response), next);

    expect(next.handle).toHaveBeenCalledTimes(1);
  });
});
