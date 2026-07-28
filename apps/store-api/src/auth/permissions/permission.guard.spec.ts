import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PermissionGuard } from './permission.guard';
import { PermissionService } from './permission.service';
import { OWNER_ONLY_KEY, REQUIRE_PERMISSION_KEY } from './require-permission.decorator';

/**
 * Guard-level unit tests (TASK-334). The e2e suite proves the wiring; these pin
 * the decision table itself, including the branches that are hard to reach
 * through HTTP (an unannotated route, a demoted actor).
 */

const loggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

class TestController {}
function handler(): void {}

interface BuildContextOptions {
  userId?: string | null;
  handlerPermission?: string;
  handlerOwnerOnly?: boolean;
  classPermission?: string;
  classOwnerOnly?: boolean;
}

function buildContext(options: BuildContextOptions): {
  context: ExecutionContext;
  request: Record<string, unknown>;
  reflector: Reflector;
} {
  const request: Record<string, unknown> = {
    user: options.userId === null ? undefined : { id: options.userId ?? 'u1', role: 'ADMIN' },
  };

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => TestController,
    getType: () => 'http',
  } as unknown as ExecutionContext;

  const reflector = {
    get: (key: string, target: unknown) => {
      const onHandler = target === handler;
      if (key === REQUIRE_PERMISSION_KEY) {
        return onHandler ? options.handlerPermission : options.classPermission;
      }
      if (key === OWNER_ONLY_KEY) {
        return onHandler ? options.handlerOwnerOnly : options.classOwnerOnly;
      }
      return undefined;
    },
  } as unknown as Reflector;

  return { context, request, reflector };
}

function buildGuard(
  reflector: Reflector,
  permissionService: Partial<PermissionService>,
): PermissionGuard {
  const guard = new PermissionGuard(
    reflector,
    permissionService as PermissionService,
    loggerMock as never,
  );
  // Authentication is JwtAuthGuard's job and is covered by the e2e 401 tests;
  // here it is stubbed so each case exercises the authorisation decision alone.
  jest
    .spyOn(Object.getPrototypeOf(PermissionGuard.prototype), 'canActivate')
    .mockResolvedValue(true);
  return guard;
}

describe('PermissionGuard (TASK-334)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lets ADMIN through any annotated route without consulting the matrix', async () => {
    const { context, reflector } = buildContext({ handlerPermission: 'orders:read' });
    const roleHasPermission = jest.fn();
    const guard = buildGuard(reflector, {
      findActor: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@x', role: UserRole.ADMIN }),
      roleHasPermission,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(roleHasPermission).not.toHaveBeenCalled();
  });

  it('lets a MANAGER through a permission the matrix grants', async () => {
    const { context, reflector } = buildContext({ handlerPermission: 'blog:write' });
    const guard = buildGuard(reflector, {
      findActor: jest.fn().mockResolvedValue({ id: 'u1', email: 'm@x', role: UserRole.MANAGER }),
      roleHasPermission: jest.fn().mockResolvedValue(true),
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('refuses a MANAGER a permission the matrix does not grant', async () => {
    const { context, reflector } = buildContext({ handlerPermission: 'orders:read' });
    const guard = buildGuard(reflector, {
      findActor: jest.fn().mockResolvedValue({ id: 'u1', email: 'm@x', role: UserRole.MANAGER }),
      roleHasPermission: jest.fn().mockResolvedValue(false),
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses everyone but ADMIN on an owner-only route, however the matrix is set', async () => {
    const { context, reflector } = buildContext({ handlerOwnerOnly: true });
    const roleHasPermission = jest.fn().mockResolvedValue(true);
    const guard = buildGuard(reflector, {
      findActor: jest.fn().mockResolvedValue({ id: 'u1', email: 'm@x', role: UserRole.MANAGER }),
      roleHasPermission,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(roleHasPermission).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED on a guarded route that declares no requirement', async () => {
    // The shape a mistake takes: an endpoint added to an already-guarded admin
    // controller without a decorator. Refused, never allowed — and logged at
    // error, because it is a code defect rather than a user error.
    const { context, reflector } = buildContext({});
    const findActor = jest.fn();
    const guard = buildGuard(reflector, { findActor });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findActor).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it('refuses a token whose account no longer resolves (edge case E-06)', async () => {
    const { context, reflector } = buildContext({ handlerPermission: 'blog:write' });
    const guard = buildGuard(reflector, { findActor: jest.fn().mockResolvedValue(null) });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a handler-level @OwnerOnly override a class-level @RequirePermission', async () => {
    // Without the override, a controller-wide `orders:read` would leak onto a
    // method the author deliberately restricted to the owner.
    const { context, reflector } = buildContext({
      classPermission: 'orders:read',
      handlerOwnerOnly: true,
    });
    const roleHasPermission = jest.fn().mockResolvedValue(true);
    const guard = buildGuard(reflector, {
      findActor: jest.fn().mockResolvedValue({ id: 'u1', email: 'm@x', role: UserRole.MANAGER }),
      roleHasPermission,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(roleHasPermission).not.toHaveBeenCalled();
  });

  it('falls back to the class-level requirement when the handler declares none', async () => {
    const { context, reflector } = buildContext({ classPermission: 'blog:write' });
    const roleHasPermission = jest.fn().mockResolvedValue(true);
    const guard = buildGuard(reflector, {
      findActor: jest.fn().mockResolvedValue({ id: 'u1', email: 'm@x', role: UserRole.MANAGER }),
      roleHasPermission,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(roleHasPermission).toHaveBeenCalledWith(UserRole.MANAGER, 'blog:write');
  });

  it('publishes the DB-resolved actor on the request for the audit interceptor', async () => {
    const { context, request, reflector } = buildContext({ handlerPermission: 'blog:write' });
    const actor = { id: 'u1', email: 'm@example.com', role: UserRole.MANAGER };
    const guard = buildGuard(reflector, {
      findActor: jest.fn().mockResolvedValue(actor),
      roleHasPermission: jest.fn().mockResolvedValue(true),
    });

    await guard.canActivate(context);

    // The audit row must name who the caller REALLY is, not what a 15-minute-old
    // token claimed.
    expect(request.permissionActor).toEqual(actor);
  });
});
