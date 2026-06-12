import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  // Minimal ExecutionContext stub — the guard only reaches getHandler/getClass
  // (via the mocked Reflector) and the HTTP request's `user`.
  const makeContext = (user: unknown): ExecutionContext =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows any authenticated user when no @Roles metadata is set', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(makeContext({ id: 'u1', role: UserRole.CUSTOMER }))).toBe(true);
  });

  it('allows any authenticated user when the roles list is empty', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(makeContext({ id: 'u1', role: UserRole.CUSTOMER }))).toBe(true);
  });

  it('allows the request when the user has the required role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(makeContext({ id: 'u1', role: UserRole.ADMIN }))).toBe(true);
  });

  it('allows the request when the user role is one of several permitted roles', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN, UserRole.CUSTOMER]);

    expect(guard.canActivate(makeContext({ id: 'u1', role: UserRole.CUSTOMER }))).toBe(true);
  });

  it('throws ForbiddenException (403) when the user lacks the required role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(() => guard.canActivate(makeContext({ id: 'u1', role: UserRole.CUSTOMER }))).toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException (403) when no user is present on the request', () => {
    // 401 (no/invalid token) is JwtAuthGuard's responsibility; if execution
    // reaches RolesGuard with no user, that is a 403.
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
