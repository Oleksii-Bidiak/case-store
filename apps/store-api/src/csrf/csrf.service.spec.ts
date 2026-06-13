import { ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { CsrfService } from './csrf.service';
import { createCsrfToken, isValidCsrfToken, safeEqual } from './csrf.util';
import { CSRF_COOKIE_DEV, CSRF_COOKIE_PROD } from './csrf.constants';

const SECRET = 'unit-test-csrf-secret-at-least-32-chars';

function makeConfig(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    NODE_ENV: 'development',
    CSRF_SECRET: SECRET,
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('csrf.util', () => {
  it('createCsrfToken produces a <value>.<signature> token', () => {
    const token = createCsrfToken(SECRET);
    expect(token.split('.')).toHaveLength(2);
  });

  it('accepts a freshly created token under the same secret', () => {
    expect(isValidCsrfToken(createCsrfToken(SECRET), SECRET)).toBe(true);
  });

  it('rejects a token signed with a different secret', () => {
    const token = createCsrfToken('a-completely-different-secret-value-32x');
    expect(isValidCsrfToken(token, SECRET)).toBe(false);
  });

  it('rejects a tampered token value', () => {
    const token = createCsrfToken(SECRET);
    const [, sig] = token.split('.');
    expect(isValidCsrfToken(`deadbeef.${sig}`, SECRET)).toBe(false);
  });

  it('rejects malformed tokens', () => {
    expect(isValidCsrfToken('no-dot-here', SECRET)).toBe(false);
    expect(isValidCsrfToken('', SECRET)).toBe(false);
    expect(isValidCsrfToken('a.b.c', SECRET)).toBe(false);
  });

  it('safeEqual is true only for identical strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('CsrfService', () => {
  function makeRes() {
    return {
      cookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response & {
      cookie: jest.Mock;
      status: jest.Mock;
      json: jest.Mock;
    };
  }

  it('uses the dev cookie name outside production', () => {
    const service = new CsrfService(makeConfig());
    expect(service.cookieName).toBe(CSRF_COOKIE_DEV);
  });

  it('uses the __Host- cookie name in production', () => {
    const service = new CsrfService(makeConfig({ NODE_ENV: 'production' }));
    expect(service.cookieName).toBe(CSRF_COOKIE_PROD);
  });

  it('warns when CSRF_SECRET is missing in production', () => {
    const loggerWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    new CsrfService(makeConfig({ NODE_ENV: 'production', CSRF_SECRET: undefined }));
    expect(loggerWarn).toHaveBeenCalled();
    loggerWarn.mockRestore();
  });

  it('issueToken sets a readable cookie and returns a valid token', () => {
    const service = new CsrfService(makeConfig());
    const res = makeRes();
    const token = service.issueToken(res);

    expect(isValidCsrfToken(token, SECRET)).toBe(true);
    expect(res.cookie).toHaveBeenCalledWith(
      CSRF_COOKIE_DEV,
      token,
      expect.objectContaining({ httpOnly: false, sameSite: 'strict', path: '/' }),
    );
  });

  describe('protect middleware', () => {
    it('passes GET requests and bootstraps the cookie when absent', () => {
      const service = new CsrfService(makeConfig());
      const res = makeRes();
      const next = jest.fn() as NextFunction;
      const req = { method: 'GET', cookies: {}, headers: {} } as unknown as Request;

      service.protect(req, res, next);

      expect(res.cookie).toHaveBeenCalled(); // bootstrapped
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('does not re-issue a cookie on GET when one already exists', () => {
      const service = new CsrfService(makeConfig());
      const res = makeRes();
      const next = jest.fn() as NextFunction;
      const req = {
        method: 'GET',
        cookies: { [CSRF_COOKIE_DEV]: createCsrfToken(SECRET) },
        headers: {},
      } as unknown as Request;

      service.protect(req, res, next);

      expect(res.cookie).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('allows a POST with a matching, valid token', () => {
      const service = new CsrfService(makeConfig());
      const res = makeRes();
      const next = jest.fn() as NextFunction;
      const token = createCsrfToken(SECRET);
      const req = {
        method: 'POST',
        cookies: { [CSRF_COOKIE_DEV]: token },
        headers: { 'x-csrf-token': token },
      } as unknown as Request;

      service.protect(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('exempts a POST that carries a Bearer token (not CSRF-vulnerable)', () => {
      const service = new CsrfService(makeConfig());
      const res = makeRes();
      const next = jest.fn() as NextFunction;
      const req = {
        method: 'POST',
        cookies: {},
        headers: { authorization: 'Bearer some.jwt.token' },
      } as unknown as Request;

      service.protect(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('rejects a POST with no CSRF header (403)', () => {
      const service = new CsrfService(makeConfig());
      const res = makeRes();
      const next = jest.fn() as NextFunction;
      const req = {
        method: 'POST',
        cookies: { [CSRF_COOKIE_DEV]: createCsrfToken(SECRET) },
        headers: {},
      } as unknown as Request;

      service.protect(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('rejects a POST when header does not match the cookie (403)', () => {
      const service = new CsrfService(makeConfig());
      const res = makeRes();
      const next = jest.fn() as NextFunction;
      const req = {
        method: 'POST',
        cookies: { [CSRF_COOKIE_DEV]: createCsrfToken(SECRET) },
        headers: { 'x-csrf-token': createCsrfToken(SECRET) },
      } as unknown as Request;

      service.protect(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('rejects a POST when the token has an invalid signature (403)', () => {
      const service = new CsrfService(makeConfig());
      const res = makeRes();
      const next = jest.fn() as NextFunction;
      const forged = 'deadbeef.deadbeef';
      const req = {
        method: 'POST',
        cookies: { [CSRF_COOKIE_DEV]: forged },
        headers: { 'x-csrf-token': forged },
      } as unknown as Request;

      service.protect(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('assertValid', () => {
    it('throws ForbiddenException for an invalid pair', () => {
      const service = new CsrfService(makeConfig());
      expect(() => service.assertValid(undefined, undefined)).toThrow(ForbiddenException);
    });

    it('does not throw for a matching valid pair', () => {
      const service = new CsrfService(makeConfig());
      const token = createCsrfToken(SECRET);
      expect(() => service.assertValid(token, token)).not.toThrow();
    });
  });
});
