import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthGuard } from './google-auth.guard';

/**
 * TASK-168 (plan 153 §TDD cases 22-23).
 *
 * The guard — not the strategy — is what gates Google sign-in on config
 * presence: without GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET both OAuth routes
 * must answer 503 (mirroring the NP_API_KEY graceful-degradation pattern),
 * while the app itself boots normally.
 */
describe('GoogleAuthGuard', () => {
  const makeGuard = (config: Record<string, string | undefined>): GoogleAuthGuard => {
    const configMock = {
      get: jest.fn((key: string) => config[key]),
    };
    return new GoogleAuthGuard(configMock as unknown as ConfigService);
  };

  // Never reached on the 503 branch — canActivate must throw before Passport
  // is ever consulted, so an empty stub is enough for a pure unit test.
  const contextStub = {} as ExecutionContext;

  describe('canActivate — config-presence gate', () => {
    it('throws ServiceUnavailableException when both Google credentials are unset', () => {
      const guard = makeGuard({});

      expect(() => guard.canActivate(contextStub)).toThrow(ServiceUnavailableException);
    });

    it('throws ServiceUnavailableException when only the client id is set', () => {
      const guard = makeGuard({ GOOGLE_CLIENT_ID: 'some-client-id' });

      expect(() => guard.canActivate(contextStub)).toThrow(ServiceUnavailableException);
    });

    it('throws ServiceUnavailableException when only the client secret is set', () => {
      const guard = makeGuard({ GOOGLE_CLIENT_SECRET: 'some-secret' });

      expect(() => guard.canActivate(contextStub)).toThrow(ServiceUnavailableException);
    });

    it('delegates to the Passport guard when both credentials are configured', () => {
      const guard = makeGuard({
        GOOGLE_CLIENT_ID: 'some-client-id',
        GOOGLE_CLIENT_SECRET: 'some-secret',
      });
      // Spy the inherited AuthGuard('google') behavior away — this stays a
      // pure unit test of the config gate, never touching real Passport.
      const superCanActivate = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockReturnValue(true);

      expect(guard.canActivate(contextStub)).toBe(true);
      expect(superCanActivate).toHaveBeenCalledWith(contextStub);

      superCanActivate.mockRestore();
    });
  });

  describe('handleRequest — never throws, the callback handler decides', () => {
    it('returns the user it is given', () => {
      const guard = makeGuard({});
      const profile = { providerId: 'google-sub-123' };

      expect(guard.handleRequest(null, profile)).toBe(profile);
    });

    it('returns undefined (instead of throwing) on a failed/denied Google auth', () => {
      const guard = makeGuard({});

      expect(() => guard.handleRequest(new Error('access_denied'), undefined)).not.toThrow();
      expect(guard.handleRequest(new Error('access_denied'), undefined)).toBeUndefined();
    });
  });
});
