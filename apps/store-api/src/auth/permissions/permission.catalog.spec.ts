import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserRole } from '@prisma/client';
import { PermissionGuard } from './permission.guard';
import { PermissionRepository } from './permission.repository';
import { OWNER_ONLY_KEY, REQUIRE_PERMISSION_KEY } from './require-permission.decorator';
import {
  MEDIA_BACKFILL_SOURCE_PERMISSIONS,
  MEDIA_PERMISSIONS,
  RETURNS_BACKFILL_SOURCE_PERMISSIONS,
  RETURNS_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_KEYS,
  isKnownPermission,
} from './permission.catalog';

/**
 * The gate against the one outcome a 43-site guard migration can produce that
 * nobody notices: a route left unguarded, and therefore silently reachable by
 * anyone with any account (TASK-334, plan 164).
 *
 * It walks the REAL controller classes and reads the REAL Nest metadata rather
 * than grepping source, so it cannot be fooled by a decorator that is present in
 * the file but not applied, and it keeps working when a controller is renamed or
 * moved. Three properties are asserted:
 *
 *   1. Every `@RequirePermission` names a permission that exists in the code
 *      catalogue. A typo'd key is a route nobody can reach — or, with a
 *      permissive guard, one everybody can.
 *   2. Every route wearing `PermissionGuard` declares a requirement. The guard
 *      itself fails closed on an unannotated route, but a 403 discovered in
 *      production by a confused manager is a worse way to learn this than a red
 *      build.
 *   3. Every route under an `admin` path IS guarded. This is the direction that
 *      matters: rules 1–2 police routes someone remembered to guard, and this
 *      one polices the routes they did not.
 */

/** Path segments that make a route part of the admin surface. */
const ADMIN_PATH_PATTERN = /(^|\/)admin(\/|$)/;

/**
 * Public routes whose path contains `admin` but which are genuinely not admin
 * endpoints. Empty today, and it should stay that way — every entry added here
 * is a route this test has stopped protecting, so an entry needs a reason
 * written next to it that a reviewer would accept.
 */
const PUBLIC_ADMIN_PATH_ALLOWLIST: ReadonlySet<string> = new Set<string>();

interface DiscoveredRoute {
  controller: string;
  handler: string;
  method: string;
  path: string;
  guardedByPermissionGuard: boolean;
  permission?: string;
  ownerOnly: boolean;
}

const SRC_ROOT = resolve(__dirname, '../..');

/** Every `*.controller.ts` under src, excluding specs. */
function findControllerFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findControllerFiles(full, found);
      continue;
    }
    if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) {
      found.push(full);
    }
  }
  return found;
}

/** Normalise a Nest path fragment: no leading/trailing slashes, no undefined. */
function normalise(fragment: unknown): string {
  if (typeof fragment !== 'string') {
    return '';
  }
  return fragment.replace(/^\/+|\/+$/g, '');
}

function guardsOf(target: object | undefined): unknown[] {
  if (!target) {
    return [];
  }
  const guards: unknown = Reflect.getMetadata(GUARDS_METADATA, target);
  return Array.isArray(guards) ? guards : [];
}

function discoverRoutes(): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];

  for (const file of findControllerFiles(SRC_ROOT)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const moduleExports = require(file) as Record<string, unknown>;

    for (const exported of Object.values(moduleExports)) {
      if (typeof exported !== 'function') {
        continue;
      }
      const controller = exported as new (...args: never[]) => object;
      const controllerPath: unknown = Reflect.getMetadata(PATH_METADATA, controller);
      if (controllerPath === undefined) {
        continue; // not a @Controller
      }

      const classGuards = guardsOf(controller);
      const classPermission: unknown = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, controller);
      const classOwnerOnly: unknown = Reflect.getMetadata(OWNER_ONLY_KEY, controller);

      const prototype = controller.prototype as Record<string, unknown>;
      for (const handlerName of Object.getOwnPropertyNames(prototype)) {
        if (handlerName === 'constructor') {
          continue;
        }
        const handler = prototype[handlerName];
        if (typeof handler !== 'function') {
          continue;
        }
        const httpMethod: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
        if (httpMethod === undefined) {
          continue; // not a route handler
        }

        const handlerGuards = guardsOf(handler as object);
        const handlerPermission: unknown = Reflect.getMetadata(
          REQUIRE_PERMISSION_KEY,
          handler as object,
        );
        const handlerOwnerOnly: unknown = Reflect.getMetadata(OWNER_ONLY_KEY, handler as object);

        // A handler-level annotation of either kind fully overrides the class —
        // must match PermissionGuard.resolveRequirement exactly, or this test
        // asserts something the runtime does not do.
        const hasHandlerAnnotation = Boolean(handlerPermission ?? handlerOwnerOnly);
        const permission = hasHandlerAnnotation
          ? (handlerPermission as string | undefined)
          : (classPermission as string | undefined);
        const ownerOnly = hasHandlerAnnotation
          ? Boolean(handlerOwnerOnly)
          : Boolean(classOwnerOnly);

        const segments = [
          normalise(controllerPath),
          normalise(Reflect.getMetadata(PATH_METADATA, handler)),
        ]
          .filter((s) => s.length > 0)
          .join('/');

        routes.push({
          controller: `${controller.name} (${relative(SRC_ROOT, file).replace(/\\/g, '/')})`,
          handler: handlerName,
          method: String(httpMethod),
          path: `/${segments}`,
          guardedByPermissionGuard:
            classGuards.includes(PermissionGuard) || handlerGuards.includes(PermissionGuard),
          permission,
          ownerOnly,
        });
      }
    }
  }

  return routes;
}

describe('permission catalogue', () => {
  const routes = discoverRoutes();

  it('discovers the controller surface (sanity check — an empty walk would pass every rule below)', () => {
    expect(routes.length).toBeGreaterThan(150);
  });

  it('declares unique permission keys', () => {
    expect(PERMISSION_KEYS.size).toBe(PERMISSIONS.length);
  });

  it('every @RequirePermission names a permission that exists in the catalogue', () => {
    const offenders = routes
      .filter((route) => route.permission !== undefined && !isKnownPermission(route.permission))
      .map(
        (route) =>
          `${route.method} ${route.path} → ${route.controller}.${route.handler} ` +
          `requires unknown permission "${route.permission ?? ''}"`,
      );

    expect(offenders).toEqual([]);
  });

  it('every route guarded by PermissionGuard declares @RequirePermission or @OwnerOnly', () => {
    const offenders = routes
      .filter((route) => route.guardedByPermissionGuard && !route.permission && !route.ownerOnly)
      .map(
        (route) =>
          `${route.method} ${route.path} → ${route.controller}.${route.handler} ` +
          'is guarded but declares no requirement (the guard will refuse it at runtime)',
      );

    expect(offenders).toEqual([]);
  });

  it('every admin-path route is guarded by PermissionGuard', () => {
    const offenders = routes
      .filter(
        (route) =>
          ADMIN_PATH_PATTERN.test(route.path) &&
          !PUBLIC_ADMIN_PATH_ALLOWLIST.has(route.path) &&
          !route.guardedByPermissionGuard,
      )
      .map(
        (route) =>
          `${route.method} ${route.path} → ${route.controller}.${route.handler} ` +
          'is an admin route with NO PermissionGuard — it bypasses the permission matrix ' +
          '(if it still carries AdminGuard it is ADMIN-only and cannot be delegated; ' +
          'if it carries no guard at all it is reachable by anyone)',
      );

    expect(offenders).toEqual([]);
  });

  it('every admin-path route declares a requirement', () => {
    const offenders = routes
      .filter(
        (route) =>
          ADMIN_PATH_PATTERN.test(route.path) &&
          !PUBLIC_ADMIN_PATH_ALLOWLIST.has(route.path) &&
          !route.permission &&
          !route.ownerOnly,
      )
      .map(
        (route) =>
          `${route.method} ${route.path} → ${route.controller}.${route.handler} ` +
          'has neither @RequirePermission nor @OwnerOnly',
      );

    expect(offenders).toEqual([]);
  });

  it('no controller still uses the retired AdminGuard', () => {
    // The migration is only finished if it cannot be partially undone: a
    // reintroduced AdminGuard would restore the hardcoded `role !== ADMIN`
    // check and quietly lock every MANAGER out of a route the matrix says they
    // hold — visible only as a support ticket months later.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AdminGuard } = require('../guards/admin.guard') as { AdminGuard: unknown };

    const offenders: string[] = [];
    for (const file of findControllerFiles(SRC_ROOT)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const moduleExports = require(file) as Record<string, unknown>;
      for (const exported of Object.values(moduleExports)) {
        if (typeof exported !== 'function') continue;
        const controller = exported as new (...args: never[]) => object;
        if (Reflect.getMetadata(PATH_METADATA, controller) === undefined) continue;

        if (guardsOf(controller).includes(AdminGuard)) {
          offenders.push(`${controller.name} (class level)`);
        }
        const prototype = controller.prototype as Record<string, unknown>;
        for (const handlerName of Object.getOwnPropertyNames(prototype)) {
          const handler = prototype[handlerName];
          if (typeof handler !== 'function') continue;
          if (guardsOf(handler as object).includes(AdminGuard)) {
            offenders.push(`${controller.name}.${handlerName}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * The media-library permission backfill (TASK-441).
 *
 * A backfill migration is the one place where "who holds what" stops being data
 * the owner edits and becomes a statement written in SQL, six directories away
 * from the rule it has to obey. Nothing in the build connects the two — the
 * migration has already run by the time anyone reads the catalogue — so this
 * suite is the connection.
 *
 * It checks three things, and each of them is a way the grant could be wrong in
 * a direction nobody would notice:
 *
 *  1. the SQL grants exactly the keys the catalogue declares (a typo'd key is a
 *     row `isKnownPermission` filters out at read time, so the grant silently
 *     does nothing and the picker is empty anyway);
 *  2. it reads exactly the source keys the code names (add `pages:write` to the
 *     list in one place only and half the shop gets a library the other half
 *     cannot see);
 *  3. it counts a row as a grant under the SAME predicate the runtime does. The
 *     runtime half is asserted by CALLING the repository, not by reading it:
 *     `findGrantedByRole` is what the guard actually consults, so if that query
 *     ever stops filtering on `allowed`, this fails here rather than in
 *     production, where the symptom is a role the owner deliberately stripped
 *     quietly getting the library back.
 */
describe('media permission backfill migration', () => {
  const MIGRATIONS_ROOT = resolve(SRC_ROOT, '../prisma/migrations');

  const sql = (() => {
    const dir = readdirSync(MIGRATIONS_ROOT).find((entry) =>
      entry.endsWith('_backfill_media_permissions'),
    );
    if (!dir) {
      throw new Error(
        `No *_backfill_media_permissions migration under ${MIGRATIONS_ROOT}. ` +
          'The two media permissions are denied by default without it, which ships an ' +
          'empty media picker to every existing content manager.',
      );
    }
    return readFileSync(join(MIGRATIONS_ROOT, dir, 'migration.sql'), 'utf8');
  })();

  /** The statement only, with the explanatory comment block stripped off. */
  const statement = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  it('grants keys that exist in the catalogue', () => {
    for (const key of MEDIA_PERMISSIONS) {
      expect(isKnownPermission(key)).toBe(true);
    }
  });

  it('grants exactly the keys the catalogue calls the media permissions', () => {
    for (const key of MEDIA_PERMISSIONS) {
      expect(statement).toContain(`'${key}'`);
    }

    // And nothing else: every quoted `x:y` token in the statement is either one
    // of the granted keys or one of the declared sources.
    const quoted = new Set(statement.match(/'[a-z]+:[a-z]+'/g) ?? []);
    const allowed = new Set(
      [...MEDIA_PERMISSIONS, ...MEDIA_BACKFILL_SOURCE_PERMISSIONS].map((key) => `'${key}'`),
    );
    expect([...quoted].filter((token) => !allowed.has(token))).toEqual([]);
  });

  it('reads exactly the source permissions the code declares', () => {
    for (const key of MEDIA_BACKFILL_SOURCE_PERMISSIONS) {
      expect(statement).toContain(`'${key}'`);
    }
    expect(MEDIA_BACKFILL_SOURCE_PERMISSIONS.every((key) => isKnownPermission(key))).toBe(true);
  });

  it('counts a row as a grant under the SAME predicate the runtime uses', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PermissionRepository({
      rolePermission: { findMany },
    } as never);

    await repository.findGrantedByRole(UserRole.MANAGER);

    // What the guard really asks for…
    expect(findMany).toHaveBeenCalledWith({ where: { role: UserRole.MANAGER, allowed: true } });
    // …and what the migration asks for. A row with `allowed = false` is a
    // DELIBERATE revocation, not "never configured", and a backfill that treated
    // the two alike would hand the library back to a role the owner stripped.
    expect(statement).toMatch(/"allowed"\s*=\s*true/);
  });

  it('never grants to ADMIN, who is not subject to the matrix at all', () => {
    // `PermissionService.roleHasPermission` short-circuits on ADMIN, so an ADMIN
    // row is inert at best — and at worst it teaches the next reader that the
    // matrix governs the owner, which is the belief the whole design refuses.
    expect(statement).not.toContain('ADMIN');
  });
});

/**
 * The returns-queue permission backfill (TASK-370 / TASK-469, plan 180).
 *
 * Same contract as the media suite above, for the same reason: the grant is
 * written in SQL six directories away from the rule it obeys, and nothing in the
 * build connects the two. What this one guards against is specifically the defect
 * that shipped twice already — a key that gates a WORKING screen and has never
 * had a `role_permissions` row, so the screen belongs to the owner alone and the
 * menu entry announcing it is simply absent for everyone else. No error, no 403,
 * nothing to notice.
 */
describe('returns permission backfill migration', () => {
  const MIGRATIONS_ROOT = resolve(SRC_ROOT, '../prisma/migrations');

  const sql = (() => {
    const dir = readdirSync(MIGRATIONS_ROOT).find((entry) =>
      entry.endsWith('_backfill_returns_permissions'),
    );
    if (!dir) {
      throw new Error(
        `No *_backfill_returns_permissions migration under ${MIGRATIONS_ROOT}. ` +
          'Both returns permissions are denied by default without it, which ships the ' +
          '«Повернення» menu entry to the owner and to nobody else.',
      );
    }
    return readFileSync(join(MIGRATIONS_ROOT, dir, 'migration.sql'), 'utf8');
  })();

  /** The statement only, with the explanatory comment block stripped off. */
  const statement = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  it('grants keys that exist in the catalogue', () => {
    for (const key of RETURNS_PERMISSIONS) {
      expect(isKnownPermission(key)).toBe(true);
    }
  });

  it('grants exactly the keys the catalogue calls the returns permissions', () => {
    for (const key of RETURNS_PERMISSIONS) {
      expect(statement).toContain(`'${key}'`);
    }

    const quoted = new Set(statement.match(/'[a-z]+:[a-z]+'/g) ?? []);
    const allowed = new Set(
      [...RETURNS_PERMISSIONS, ...RETURNS_BACKFILL_SOURCE_PERMISSIONS].map((key) => `'${key}'`),
    );
    expect([...quoted].filter((token) => !allowed.has(token))).toEqual([]);
  });

  it('reads exactly the source permissions the code declares', () => {
    for (const key of RETURNS_BACKFILL_SOURCE_PERMISSIONS) {
      expect(statement).toContain(`'${key}'`);
    }
    expect(RETURNS_BACKFILL_SOURCE_PERMISSIONS.every((key) => isKnownPermission(key))).toBe(true);
  });

  it('counts a row as a grant under the SAME predicate the runtime uses', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PermissionRepository({
      rolePermission: { findMany },
    } as never);

    await repository.findGrantedByRole(UserRole.MANAGER);

    expect(findMany).toHaveBeenCalledWith({ where: { role: UserRole.MANAGER, allowed: true } });
    expect(statement).toMatch(/"allowed"\s*=\s*true/);
  });

  it('never grants to ADMIN, who is not subject to the matrix at all', () => {
    expect(statement).not.toContain('ADMIN');
  });
});
