import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  let guard: AdminGuard;

  const makeContext = (user: unknown): ExecutionContext =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    guard = new AdminGuard();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('propagates 401 when the JWT layer rejects (unauthenticated)', async () => {
    // Authentication is JwtAuthGuard's job; AdminGuard must not swallow its 401.
    jest
      .spyOn(JwtAuthGuard.prototype, 'canActivate')
      .mockRejectedValue(new UnauthorizedException());

    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(UnauthorizedException);
  });

  it('throws 403 for an authenticated non-admin (CUSTOMER)', async () => {
    jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockResolvedValue(true);

    await expect(
      guard.canActivate(makeContext({ id: 'u1', role: UserRole.CUSTOMER })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows an authenticated ADMIN through', async () => {
    jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockResolvedValue(true);

    await expect(guard.canActivate(makeContext({ id: 'u1', role: UserRole.ADMIN }))).resolves.toBe(
      true,
    );
  });
});
