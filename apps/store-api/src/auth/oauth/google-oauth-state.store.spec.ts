import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { GoogleOAuthStateStore } from './google-oauth-state.store';

/**
 * TASK-168 (plan 153 §TDD cases 17-21).
 *
 * Session-free OAuth `state` CSRF protection: no express-session exists in
 * this app, so the store mints a short-lived JWT (signed with the existing
 * JWT_SECRET) as the `state` value Google echoes back verbatim. `verify()`
 * accepts only a signature-valid, unexpired token WE minted, and stashes the
 * decoded redirect target on `req.oauthRedirect` (same "stash on req" pattern
 * JwtRefreshStrategy uses for `req._refreshToken`).
 */
describe('GoogleOAuthStateStore', () => {
  const TEST_SECRET = 'test-oauth-state-secret-at-least-32-chars-long';

  let store: GoogleOAuthStateStore;
  let jwtService: JwtService;

  const makeReq = (query: Record<string, unknown> = {}): Request =>
    ({ query }) as unknown as Request;

  beforeEach(() => {
    jwtService = new JwtService({});
    const configMock = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return TEST_SECRET;
        throw new Error(`Configuration key "${key}" does not exist`);
      }),
    };
    store = new GoogleOAuthStateStore(jwtService, configMock as unknown as ConfigService);
  });

  describe('store (leg 1 — mint the state)', () => {
    it('mints a signed state embedding the sanitized redirect and a nonce', (done) => {
      store.store(makeReq({ redirect: '/checkout' }), (err, state) => {
        expect(err).toBeNull();
        expect(typeof state).toBe('string');

        const decoded = jwtService.verify<{ nonce: string; redirect: string }>(state as string, {
          secret: TEST_SECRET,
        });
        expect(decoded.redirect).toBe('/checkout');
        expect(typeof decoded.nonce).toBe('string');
        expect(decoded.nonce.length).toBeGreaterThan(0);
        done();
      });
    });

    it('defaults the embedded redirect to / when the query param is absent', (done) => {
      store.store(makeReq(), (err, state) => {
        expect(err).toBeNull();

        const decoded = jwtService.verify<{ nonce: string; redirect: string }>(state as string, {
          secret: TEST_SECRET,
        });
        expect(decoded.redirect).toBe('/');
        done();
      });
    });
  });

  describe('verify (leg 2 — validate the echoed state)', () => {
    it('accepts a state it minted itself and stashes the redirect on req', (done) => {
      const mintReq = makeReq({ redirect: '/checkout' });

      store.store(mintReq, (_mintErr, state) => {
        const cbReq = makeReq();

        store.verify(cbReq, state as string, (err, ok) => {
          expect(err).toBeNull();
          expect(ok).toBe(true);
          expect(cbReq.oauthRedirect).toBe('/checkout');
          done();
        });
      });
    });

    it('rejects a garbage/tampered state without stashing a redirect', (done) => {
      const cbReq = makeReq();

      store.verify(cbReq, 'not-a-jwt-at-all', (err, ok, info) => {
        expect(err).toBeNull();
        expect(ok).toBe(false);
        expect(info).toEqual({ message: expect.any(String) });
        expect(cbReq.oauthRedirect).toBeUndefined();
        done();
      });
    });

    it('rejects an expired state the same way', (done) => {
      // Signed with the right secret but already expired.
      const expiredState = jwtService.sign(
        { nonce: 'abc', redirect: '/checkout' },
        { secret: TEST_SECRET, expiresIn: '-10s' },
      );
      const cbReq = makeReq();

      store.verify(cbReq, expiredState, (err, ok, info) => {
        expect(err).toBeNull();
        expect(ok).toBe(false);
        expect(info).toEqual({ message: expect.any(String) });
        expect(cbReq.oauthRedirect).toBeUndefined();
        done();
      });
    });
  });
});
