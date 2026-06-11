import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

/**
 * Unit tests for OptionalJwtAuthGuard.handleRequest — the override that makes
 * a missing/invalid JWT resolve to a guest instead of throwing 401.
 */
describe('OptionalJwtAuthGuard', () => {
  const guard = new OptionalJwtAuthGuard();

  it('returns the authenticated user when the token is valid', () => {
    const user = { id: 'user-1', role: 'CUSTOMER' };

    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('returns null (does not throw) when no token is provided', () => {
    expect(guard.handleRequest(null, null)).toBeNull();
    expect(guard.handleRequest(null, undefined)).toBeNull();
  });

  it('returns null (does not throw) when the token is invalid or expired', () => {
    const err = new Error('jwt expired');

    expect(guard.handleRequest(err, null)).toBeNull();
  });
});
