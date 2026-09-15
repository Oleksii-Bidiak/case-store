import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PermissionGuard } from './permission.guard';
import { PermissionService } from './permission.service';
import type { PermissionActor } from './permission.repository';
import { OWNER_ONLY_KEY, REQUIRE_PERMISSION_KEY } from './require-permission.decorator';

/**
 * Guard-level unit tests (TASK-334, rewritten for the per-person model in
 * TASK-475). The e2e suite proves the wiring; these pin the decision table
 * itself, including the branches that are hard to reach through HTTP (an
 * unannotated route, a demoted actor).
 *
 * THE ORDER IS THE SUBJECT OF THIS FILE, not an implementation detail of it:
 *
 *   owner → @OwnerOnly → admin → the actor's own rows
 *
 * Swap the middle two and an admin reaches the owner's reserve — the four doors
 * that decide who runs the shop — while every test that only checks "an admin
 * can do admin things" still passes. That is why the admin-versus-`@OwnerOnly`
 * case below is written as its own assertion rather than folded into a table.
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

/** A live actor as `findActor` now returns one: level plus their own rows. */
function actor(overrides: Partial<PermissionActor> = {}): PermissionActor {
  return {
    id: 'u1',
    email: 'staff@example.com',
    role: UserRole.MANAGER,
    isOwner: false,
    permissions: new Set<string>(),
    ...overrides,
  };
}

const OWNER = actor({ id: 'owner-1', email: 'owner@x', role: UserRole.ADMIN, isOwner: true });
const DEPUTY = actor({ id: 'deputy-1', email: 'deputy@x', role: UserRole.ADMIN });

/**
 * The real `actorHasPermission`, not a stub. The guard's job is the ORDER of the
 * checks, and a stub that answers true for everybody would hide an order that is
 * wrong — the admin bypass firing before `@OwnerOnly` looks identical to the
 * correct guard if the permission lookup always says yes.
 */
function permissionServiceWith(resolved: PermissionActor | null): Partial<PermissionService> {
  return {
    findActor: jest.fn().mockResolvedValue(resolved),
    actorHasPermission: (candidate: PermissionActor, permission: string) => {
      if (candidate.isOwner || candidate.role === UserRole.ADMIN) return true;
      if (candidate.role === UserRole.CUSTOMER) return false;
      return candidate.permissions.has(permission);
    },
  };
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

describe('PermissionGuard (TASK-475)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('the owner', () => {
    it('passes an ordinary permission route without holding the row', async () => {
      const { context, reflector } = buildContext({ handlerPermission: 'orders:read' });
      const guard = buildGuard(reflector, permissionServiceWith(OWNER));

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('passes an @OwnerOnly route — the reserve is theirs', async () => {
      const { context, reflector } = buildContext({ handlerOwnerOnly: true });
      const guard = buildGuard(reflector, permissionServiceWith(OWNER));

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  describe('a deputy ADMIN who is not the owner', () => {
    it('passes every @RequirePermission route without a single row of their own', async () => {
      const { context, reflector } = buildContext({ handlerPermission: 'payments:refund' });
      const guard = buildGuard(reflector, permissionServiceWith(DEPUTY));

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('is REFUSED an @OwnerOnly route — checked before the admin bypass', async () => {
      // The single assertion this whole task turns on. An admin passes every
      // permission, so the only thing standing between a deputy and the owner's
      // reserve is that `@OwnerOnly` is read FIRST.
      const { context, reflector } = buildContext({ handlerOwnerOnly: true });
      const guard = buildGuard(reflector, permissionServiceWith(DEPUTY));

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'rbac.denied', reason: 'owner-only' }),
        expect.any(String),
      );
    });

    it('is refused an @OwnerOnly method even under a permissive class annotation', async () => {
      // Without the handler-over-class override a controller-wide
      // `@RequirePermission` would leak onto the one method its author
      // deliberately reserved.
      const { context, reflector } = buildContext({
        classPermission: 'orders:read',
        handlerOwnerOnly: true,
      });
      const guard = buildGuard(reflector, permissionServiceWith(DEPUTY));

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('a MANAGER', () => {
    it('passes a permission they personally hold', async () => {
      const { context, reflector } = buildContext({ handlerPermission: 'blog:write' });
      const guard = buildGuard(
        reflector,
        permissionServiceWith(actor({ permissions: new Set(['blog:write']) })),
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('is refused a permission nobody granted them (invariant 4)', async () => {
      const { context, reflector } = buildContext({ handlerPermission: 'orders:read' });
      const guard = buildGuard(
        reflector,
        permissionServiceWith(actor({ permissions: new Set(['blog:write']) })),
      );

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('with NO rows at all is refused every annotated route', async () => {
      for (const permission of ['orders:read', 'blog:write', 'analytics:read']) {
        const { context, reflector } = buildContext({ handlerPermission: permission });
        const guard = buildGuard(reflector, permissionServiceWith(actor()));

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
      }
    });

    it('is refused an @OwnerOnly route however their rows are set', async () => {
      const { context, reflector } = buildContext({ handlerOwnerOnly: true });
      const guard = buildGuard(
        reflector,
        permissionServiceWith(actor({ permissions: new Set(['staff:write', 'audit:read']) })),
      );

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('loses a revoked permission on the very next request — there is no cache (invariant 8)', async () => {
      // Rights ride along on the actor read, so "revoked" and "refused" are the
      // same event rather than two events a TTL apart.
      const before = actor({ permissions: new Set(['blog:write']) });
      const after = actor({ permissions: new Set<string>() });

      const findActor = jest.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after);
      const service = { ...permissionServiceWith(before), findActor };

      const first = buildContext({ handlerPermission: 'blog:write' });
      await expect(buildGuard(first.reflector, service).canActivate(first.context)).resolves.toBe(
        true,
      );

      const second = buildContext({ handlerPermission: 'blog:write' });
      await expect(
        buildGuard(second.reflector, service).canActivate(second.context),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Two requests, two reads. A cache between them is what invariant 8 forbids.
      expect(findActor).toHaveBeenCalledTimes(2);
    });
  });

  describe('everything else', () => {
    it('refuses a CUSTOMER whose account still carries rows', async () => {
      const { context, reflector } = buildContext({ handlerPermission: 'orders:read' });
      const guard = buildGuard(
        reflector,
        permissionServiceWith(
          actor({ role: UserRole.CUSTOMER, permissions: new Set(['orders:read']) }),
        ),
      );

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('FAILS CLOSED on a guarded route that declares no requirement', async () => {
      // The shape a mistake takes: an endpoint added to an already-guarded admin
      // controller without a decorator. Refused, never allowed — and logged at
      // error, because it is a code defect rather than a user error.
      const { context, reflector } = buildContext({});
      const service = permissionServiceWith(OWNER);
      const guard = buildGuard(reflector, service);

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.findActor).not.toHaveBeenCalled();
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('refuses a token whose account no longer resolves (edge case E-06)', async () => {
      const { context, reflector } = buildContext({ handlerPermission: 'blog:write' });
      const guard = buildGuard(reflector, permissionServiceWith(null));

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('falls back to the class-level requirement when the handler declares none', async () => {
      const { context, reflector } = buildContext({ classPermission: 'blog:write' });
      const guard = buildGuard(
        reflector,
        permissionServiceWith(actor({ permissions: new Set(['blog:write']) })),
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('publishes the DB-resolved actor on the request for the audit interceptor', async () => {
      const { context, request, reflector } = buildContext({ handlerPermission: 'blog:write' });
      const resolved = actor({ email: 'm@example.com', permissions: new Set(['blog:write']) });
      const guard = buildGuard(reflector, permissionServiceWith(resolved));

      await guard.canActivate(context);

      // The audit row must name who the caller REALLY is, not what a 15-minute-old
      // token claimed.
      expect(request.permissionActor).toEqual(resolved);
    });

    it('tells every refused caller exactly the same thing', async () => {
      // "You are a shopper", "you lack this permission" and "this is owner-only"
      // must be indistinguishable from outside: a 403 that names the missing key
      // maps the admin surface one request at a time.
      const messages: string[] = [];

      for (const resolved of [actor({ role: UserRole.CUSTOMER }), actor(), DEPUTY]) {
        const { context, reflector } = buildContext({
          handlerPermission: 'orders:read',
          handlerOwnerOnly: resolved === DEPUTY,
        });
        const guard = buildGuard(reflector, permissionServiceWith(resolved));

        await guard.canActivate(context).catch((error: ForbiddenException) => {
          messages.push(error.message);
        });
      }

      expect(messages).toEqual([
        'Admin access required',
        'Admin access required',
        'Admin access required',
      ]);
    });
  });
});
