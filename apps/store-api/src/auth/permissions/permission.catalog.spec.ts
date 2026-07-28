import { readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PermissionGuard } from './permission.guard';
import { OWNER_ONLY_KEY, REQUIRE_PERMISSION_KEY } from './require-permission.decorator';
import { PERMISSIONS, PERMISSION_KEYS, isKnownPermission } from './permission.catalog';

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
          'is an admin route with NO PermissionGuard — it is reachable by anyone',
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
