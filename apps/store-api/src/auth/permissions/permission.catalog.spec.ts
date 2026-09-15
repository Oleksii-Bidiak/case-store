import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PermissionGuard } from './permission.guard';
import { OWNER_ONLY_KEY, REQUIRE_PERMISSION_KEY } from './require-permission.decorator';
import {
  GRANTABLE_PERMISSIONS,
  CUSTOMERS_CARD_BACKFILL_SOURCE_PERMISSIONS,
  CUSTOMERS_CARD_PERMISSIONS,
  MANAGER_BACKFILL_TEMPLATE_NAME,
  MEDIA_BACKFILL_SOURCE_PERMISSIONS,
  MEDIA_PERMISSIONS,
  NON_GRANTABLE_PERMISSIONS,
  RETURNS_BACKFILL_SOURCE_PERMISSIONS,
  RETURNS_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSION_ZONES,
  PERMISSION_ZONE_LABELS,
  isGrantablePermission,
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

  it('gives every permission a zone that has a label', () => {
    const labelled = new Set(PERMISSION_ZONE_LABELS.map((entry) => entry.zone));
    const offenders = PERMISSIONS.filter((permission) => !labelled.has(permission.zone)).map(
      (permission) => `${permission.key} is in zone "${permission.zone}", which has no label`,
    );

    expect(offenders).toEqual([]);
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

  it('leaves no controller carrying a guard that answers a ROLE instead of a person', () => {
    // `AdminGuard` and `RolesGuard` were deleted in TASK-475, so the old check —
    // "does any controller still reference them" — can no longer be written by
    // importing them. It is replaced by the stronger property their deletion was
    // for: every guard a controller wears is one this codebase still defines.
    //
    // The direction that matters is a REINTRODUCTION. `RolesGuard` with no
    // `@Roles` metadata let through any authenticated caller at all
    // (roles.guard.ts:30-32), and `AdminGuard` hardcoded `role !== ADMIN`, which
    // locks out a manager the grant screen says is allowed. Both failures are
    // invisible until somebody complains.
    const offenders: string[] = [];
    for (const file of findControllerFiles(SRC_ROOT)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const moduleExports = require(file) as Record<string, unknown>;
      for (const exported of Object.values(moduleExports)) {
        if (typeof exported !== 'function') continue;
        const controller = exported as new (...args: never[]) => object;
        if (Reflect.getMetadata(PATH_METADATA, controller) === undefined) continue;

        const named = (guards: unknown[]) =>
          guards
            .filter((guard): guard is { name: string } => typeof guard === 'function')
            .map((guard) => guard.name);

        for (const guardName of named(guardsOf(controller))) {
          if (/^(AdminGuard|RolesGuard)$/.test(guardName)) {
            offenders.push(`${controller.name} (class level) uses ${guardName}`);
          }
        }
        const prototype = controller.prototype as Record<string, unknown>;
        for (const handlerName of Object.getOwnPropertyNames(prototype)) {
          const handler = prototype[handlerName];
          if (typeof handler !== 'function') continue;
          for (const guardName of named(guardsOf(handler as object))) {
            if (/^(AdminGuard|RolesGuard)$/.test(guardName)) {
              offenders.push(`${controller.name}.${handlerName} uses ${guardName}`);
            }
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * Grantability (TASK-475, plan 181).
 *
 * A permission key is not automatically something the owner may hand to somebody.
 * Three of them — the staff register and the action log — are real keys that
 * `@RequirePermission` enforces, and are deliberately absent from every granting
 * surface, so by construction only an owner and an admin can hold them.
 *
 * WHY THIS REPLACED `@OwnerOnly` FOR THOSE THREE. `@OwnerOnly` now means the
 * owner ALONE (plan 178, decision 1), and the whole point of a deputy admin is
 * that the shop runs while the owner is away: reading the log and managing
 * managers are exactly the jobs a deputy is for. But they are still not jobs to
 * delegate downwards — an operator who could read the log could check whether
 * their own actions had been noticed, and one who could edit staff could promote
 * themselves. Non-grantable is the level in between, and it is the only one that
 * says both things at once.
 */
describe('grantable and non-grantable permissions', () => {
  it('splits the catalogue into exactly grantable + non-grantable, with no overlap', () => {
    expect(GRANTABLE_PERMISSIONS.length + NON_GRANTABLE_PERMISSIONS.length).toBe(
      PERMISSIONS.length,
    );

    const grantable = new Set(GRANTABLE_PERMISSIONS.map((p) => p.key));
    const overlap = NON_GRANTABLE_PERMISSIONS.filter((p) => grantable.has(p.key));
    expect(overlap).toEqual([]);
  });

  it('never offers the staff register or the action log', () => {
    const grantable = GRANTABLE_PERMISSIONS.map((p) => p.key);

    for (const key of ['staff:read', 'staff:write', 'audit:read']) {
      // They exist…
      expect(isKnownPermission(key)).toBe(true);
      // …and they are never on offer.
      expect(grantable).not.toContain(key);
      expect(isGrantablePermission(key)).toBe(false);
    }
  });

  it('keeps every other permission grantable — non-grantable is the rare exception', () => {
    expect(NON_GRANTABLE_PERMISSIONS.map((p) => p.key).sort()).toEqual([
      'audit:read',
      'staff:read',
      'staff:write',
    ]);
  });

  it('puts the non-grantable keys in their own zone, so a UI cannot render them by accident', () => {
    for (const permission of NON_GRANTABLE_PERMISSIONS) {
      expect(permission.zone).toBe(PERMISSION_ZONES.STAFF);
    }
  });

  it('refuses an unknown key as non-grantable rather than falling through', () => {
    expect(isGrantablePermission('blog:writ')).toBe(false);
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

  it('counts a row as a grant only where it was deliberately allowed', () => {
    // A row with `allowed = false` was a DELIBERATE revocation, not "never
    // configured", and a backfill that treated the two alike would hand the
    // library back to a role the owner had stripped.
    //
    // This used to be pinned against `PermissionRepository.findGrantedByRole`,
    // which read the same predicate at runtime. TASK-475 removed both the method
    // and the `role_permissions` table, so the statement is now frozen history —
    // it replays on a fresh database in migration order, against the table as it
    // existed at the time, and there is no runtime query left for it to drift
    // from. The assertion stays because the replay is still real.
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
 * The access-model migration (TASK-474, plan 181), pinned against the code the
 * same way the media backfill above is.
 *
 * This migration changes no behaviour — nothing reads the new tables yet — which
 * is exactly why it needs a test. Its whole value is in two properties that are
 * invisible until the day they are missing:
 *
 *  1. THE SINGLE-OWNER INVARIANT IS A DATABASE CONSTRAINT, NOT A CONVENTION.
 *     "Exactly one `isOwner = true`" is the hinge of the entire level model
 *     (plan 178, decision 1): the owner is the only account nobody else may
 *     touch. Enforced in application code it holds until the first concurrent
 *     write or the first raw UPDATE; enforced as a partial unique index it holds
 *     always. The index is DECLARED IN `schema.prisma` (Prisma's `partialIndexes`
 *     preview feature) rather than hand-written here, so the schema stays the
 *     source of truth and a future `migrate dev` cannot quietly generate it away
 *     — this test asserts the generated DDL is actually present.
 *
 *  2. THE BACKFILL PRESERVES EXACTLY WHAT PEOPLE HAVE TODAY. Permissions move
 *     from the role to the person, so every live MANAGER must come out of the
 *     migration holding precisely the set their role granted — read under the
 *     SAME predicate the runtime uses. Looser, and a permission the owner
 *     deliberately revoked comes back; stricter, and an employee silently loses
 *     access mid-shift. The real proof that the copy lands correctly is the
 *     integration spec (`test/access-model-backfill.int-spec.ts`), which runs
 *     these very statements against a real Postgres; this file pins the SQL's
 *     intent against the code so the two halves cannot drift.
 */
describe('access model migration (TASK-474)', () => {
  const MIGRATIONS_ROOT = resolve(SRC_ROOT, '../prisma/migrations');

  const sql = (() => {
    const dir = readdirSync(MIGRATIONS_ROOT).find((entry) => entry.endsWith('_access_model'));
    if (!dir) {
      throw new Error(
        `No *_access_model migration under ${MIGRATIONS_ROOT}. Without it there is no ` +
          'owner flag, no per-person permissions, and every live manager loses their ' +
          'access the moment the guard stops reading role_permissions.',
      );
    }
    return readFileSync(join(MIGRATIONS_ROOT, dir, 'migration.sql'), 'utf8');
  })();

  /** Everything but the explanatory comment blocks. */
  const stripComments = (text: string): string =>
    text
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');

  /**
   * One labelled section of the backfill. The markers live in the SQL because
   * the integration spec slices on them too — it executes the real statements
   * rather than a copy of them — and because the two halves of the backfill make
   * opposite claims about roles: the owner flag necessarily names ADMIN, while
   * the permission copy necessarily must not.
   */
  const section = (marker: string): string => {
    const start = sql.indexOf(`-- backfill:${marker}:start`);
    const end = sql.indexOf(`-- backfill:${marker}:end`);
    if (start < 0 || end < 0) {
      throw new Error(`Migration has no \`-- backfill:${marker}:{start,end}\` markers.`);
    }
    return stripComments(sql.slice(start, end));
  };

  const ddl = stripComments(sql);
  const ownerFlag = section('owner');
  const managerGrants = section('manager-permissions');

  it('enforces "at most one owner" with a partial unique index, generated from the schema', () => {
    // The exact DDL Prisma emits for
    // `@@unique([isOwner], where: { isOwner: true }, map: "users_single_owner_key")`.
    // Pinned verbatim: a PLAIN unique index on `is_owner` would allow one owner
    // and exactly one non-owner in the whole shop, which is not the same rule.
    expect(ddl).toContain(
      'CREATE UNIQUE INDEX "users_single_owner_key" ON "users"("is_owner") WHERE ("is_owner" = true)',
    );
  });

  it('hands the owner flag to the oldest admin, and only when nobody holds it', () => {
    expect(ownerFlag).toMatch(/"role"\s*=\s*'ADMIN'/);
    expect(ownerFlag).toMatch(/LIMIT\s+1/);
    // Idempotence and the invariant in one clause: a second run cannot create a
    // second owner, so re-running the backfill cannot trip the index.
    expect(ownerFlag).toMatch(/NOT EXISTS/);
  });

  it('prefers an ACTIVE admin but does not require one — a shop must not end ownerless', () => {
    // `is_active` belongs in the ORDER BY, never in the WHERE. As a FILTER it
    // produced `WHERE "id" = NULL` on a database whose only admin was switched
    // off: nothing matched, the migration COMMITTED, `migrate deploy` exited 0,
    // and `_prisma_migrations` recorded it as applied so it could never run
    // again. The shop then had no owner and no way to acquire one, because the
    // only `isOwner` write in the API is the transfer and that is `@OwnerOnly`.
    // An owner somebody must re-activate first is strictly better: re-activation
    // is a route that exists, appointing an owner is not.
    expect(ownerFlag).toMatch(/ORDER BY[\s\S]*"is_active"\s+DESC[\s\S]*"created_at"\s+ASC/);
    expect(ownerFlag).not.toMatch(/"is_active"\s*=\s*true/);
    // The tombstone stays a hard exclusion: it is set once, never cleared, and
    // the account's email is mangled, so it can never sign in again.
    expect(ownerFlag).toMatch(/"deleted_at"\s+IS NULL/);
  });

  it('copies only grants that were deliberately allowed', () => {
    // `allowed = false` is a DELIBERATE revocation, not "never configured"; a
    // backfill that ignored the column would hand every manager back a key the
    // owner had taken away. Pinned against `PermissionRepository.findGrantedByRole`
    // until TASK-475 deleted both that method and the table it read — see the
    // note on the media backfill above for why the SQL assertion still earns its
    // place afterwards.
    expect(managerGrants).toMatch(/"allowed"\s*=\s*true/);
  });

  it('excludes tombstones and ONLY tombstones — a manager on leave keeps their set', () => {
    // The tombstone is permanent; `is_active` is a reversible toggle the owner
    // flips for somebody on leave. This copy filtered on `is_active = true` at
    // first, reasoning that rows on a switched-off account would sit there until
    // somebody re-enabled it and found it fully armed. That reasoning does not
    // survive the code this wave ships: `StaffService.setStatus(false)` deletes
    // nobody's rows, so "switched off" always keeps its permissions — and the
    // sibling migration (`…_backfill_customers_card_permission`) argues the other
    // way explicitly. One wave answering the same question two ways is a defect
    // in whichever half is wrong, and it was this one.
    //
    // The loss was also unrecoverable: `role_permissions` is dropped by the very
    // next migration, so a manager skipped here has no source left to restore
    // from. They come back to an empty menu. Rights are dropped when somebody
    // LEAVES the staff — `StaffService.updateRole` clears them explicitly — and
    // being on leave is not leaving.
    expect(managerGrants).not.toMatch(/"is_active"/);
    expect(managerGrants).toMatch(/"deleted_at"\s+IS NULL/);
  });

  it('never copies rows to ADMIN, who is not subject to the matrix at all', () => {
    // An ADMIN passes every permission check by construction, so rows for them
    // would be inert at best — and at worst they would teach the next reader
    // that the matrix governs the owner, which is the belief this model refuses.
    expect(managerGrants).toContain("'MANAGER'");
    expect(managerGrants).not.toContain('ADMIN');
  });

  it('names the preserved template exactly as the code names it', () => {
    // The SQL creates it; TASK-475 onwards looks it up. One literal spelled in
    // two places is a rename waiting to orphan the template.
    expect(managerGrants).toContain(`'${MANAGER_BACKFILL_TEMPLATE_NAME}'`);
  });
});

/**
 * The customer-card split (TASK-479, plan 181, invariant 7).
 *
 * `customers:read` used to buy two purchases at once: the list plus the contact
 * details an operator needs in order to phone somebody, AND the full customer
 * card — lifetime value, every order with its total, the text of every review,
 * every redeemed coupon and the full text of every support message. The second
 * is the richest personal-data surface in the system and an order operator does
 * not need it to return a call, so it has a key of its own now.
 *
 * Rejected alternative, worth naming because it is the obvious one: masking the
 * phone number behind `+380 ** *** 12 34` with a "reveal" button. It protects
 * nothing while the same person opens the customer's order and reads the same
 * number in the clear, and the reveal button only means something next to an
 * audit of READS, which this system does not have — only mutations are audited
 * (plan 178, decision 4).
 */
describe('customers:card — the split key (TASK-479)', () => {
  const card = (PERMISSIONS as ReadonlyArray<{ key: string; zone: string; label: string }>).find(
    (permission) => permission.key === 'customers:card',
  );

  it('exists, and says on the screen what it actually opens', () => {
    expect(card).toBeDefined();
    // Not a label like «Картка клієнта», which is what `customers:read` already
    // sounds like it buys. The owner ticking this box is handing over purchase
    // history and support correspondence, and the words have to say so.
    expect(card?.label).toMatch(/замовлен/i);
  });

  it('is grantable, and sits with the other customer keys', () => {
    expect(isGrantablePermission('customers:card')).toBe(true);
    expect(card?.zone).toBe(PERMISSION_ZONES.CUSTOMERS);
  });

  it('is a separate key from customers:read rather than a rename of it', () => {
    // The list and the contacts must survive the split untouched — an operator
    // who could phone a customer yesterday can still phone them today.
    expect(isKnownPermission('customers:read')).toBe(true);
    expect(isKnownPermission('customers:card')).toBe(true);
  });
});

/**
 * The `customers:card` backfill migration (TASK-479).
 *
 * Pinned exactly like the media backfill above, and for the same reason: a
 * backfill is the one place where "who holds what" stops being data the owner
 * edits and becomes a sentence written in SQL, six directories from the rule it
 * has to obey.
 *
 * ONE SHAPE CHANGED SINCE THE MEDIA BACKFILL, AND IT IS THE WHOLE DIFFERENCE.
 * Grants live in `user_permissions(user_id, permission)` now — TASK-475 moved
 * them off the role and TASK-476 dropped `role_permissions` entirely — so this
 * one inserts per PERSON. There is no `allowed` column to reason about either:
 * the row IS the grant, and a revocation is the row's absence.
 */
describe('customers:card permission backfill migration (TASK-479)', () => {
  const MIGRATIONS_ROOT = resolve(SRC_ROOT, '../prisma/migrations');

  const sql = (() => {
    const dir = readdirSync(MIGRATIONS_ROOT).find((entry) =>
      entry.endsWith('_backfill_customers_card_permission'),
    );
    if (!dir) {
      throw new Error(
        `No *_backfill_customers_card_permission migration under ${MIGRATIONS_ROOT}. ` +
          'Without it the split silently REMOVES the customer card from every operator ' +
          'who can open it today — a 403 on a screen that worked yesterday.',
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
    for (const key of CUSTOMERS_CARD_PERMISSIONS) {
      expect(isKnownPermission(key)).toBe(true);
    }
  });

  it('grants exactly the key the catalogue calls the card permission', () => {
    for (const key of CUSTOMERS_CARD_PERMISSIONS) {
      expect(statement).toContain(`'${key}'`);
    }

    // And nothing else: every quoted `x:y` token in the statement is either the
    // granted key or one of the declared sources.
    const quoted = new Set(statement.match(/'[a-z]+:[a-z]+'/g) ?? []);
    const allowed = new Set(
      [...CUSTOMERS_CARD_PERMISSIONS, ...CUSTOMERS_CARD_BACKFILL_SOURCE_PERMISSIONS].map(
        (key) => `'${key}'`,
      ),
    );
    expect([...quoted].filter((token) => !allowed.has(token))).toEqual([]);
  });

  it('reads exactly the source permissions the code declares', () => {
    for (const key of CUSTOMERS_CARD_BACKFILL_SOURCE_PERMISSIONS) {
      expect(statement).toContain(`'${key}'`);
    }
    expect(CUSTOMERS_CARD_BACKFILL_SOURCE_PERMISSIONS.every((key) => isKnownPermission(key))).toBe(
      true,
    );
  });

  it('grants to a PERSON, because that is where a grant lives now', () => {
    // The media backfill above inserts into `role_permissions`, a table TASK-476
    // dropped. Copying its statement into this file would have produced a
    // migration that fails on a fresh database and is a no-op on an existing one
    // — the kind of wrong that only shows up at deploy time.
    expect(statement).toContain('"user_permissions"');
    expect(statement).toContain('"user_id"');
    expect(statement).not.toContain('role_permissions');
  });

  it('is idempotent, so a restore-then-migrate cannot double-grant or fail', () => {
    expect(statement).toMatch(/ON CONFLICT[\s\S]*DO NOTHING/);
  });

  it('carries the carve-out into TEMPLATES as well as people', () => {
    // A template is what the next hire is set up from, so a key split out of
    // `customers:read` has to follow it there too. Without this the split reaches
    // everybody who already works here and misses everybody hired afterwards —
    // two groups with different access from the same tick.
    //
    // «Менеджер (як було)» is the concrete case: the TASK-474 migration created
    // it one migration before this key existed, and `docs/admin-guide.md` tells
    // the owner it holds exactly what the MANAGER role used to. Without the
    // second statement that sentence is false in the same release that created
    // the template.
    expect(statement).toContain('"permission_template_items"');
    expect(statement).toContain('"template_id"');
    // Both halves idempotent, not just the first.
    expect(statement.match(/ON CONFLICT/g) ?? []).toHaveLength(2);
  });

  it('never names a role at all — an admin passes by level, not by row', () => {
    // An ADMIN holds every catalogue key without a single row of their own
    // (`PermissionService`), so a row for them would be inert at best and at
    // worst would teach the next reader that rows govern the owner.
    expect(statement).not.toContain('ADMIN');
    expect(statement).not.toContain('MANAGER');
  });
});

/**
 * The returns-queue permission backfill (TASK-370 / TASK-469, plan 180), as this
 * wave has to ship it: per PERSON.
 *
 * Same contract as the suites above, for the same reason — the grant is written
 * in SQL six directories away from the rule it obeys, and nothing in the build
 * connects the two. What it guards against is the defect that shipped twice
 * already: a key that gates a WORKING screen and has never been granted to
 * anybody, so the screen belongs to the owner alone and the menu entry
 * announcing it is simply absent for everyone else. No error, no 403, nothing to
 * notice.
 *
 * WHY THERE ARE TWO MIGRATIONS FOR ONE GRANT, AND WHY THIS SUITE READS THE
 * SECOND. Plan 180 wrote it into `role_permissions` at `20260914183500`. Plan
 * 181 drops that table at `20260914160000`, which sorts EARLIER, so on a develop
 * carrying both waves the deploy replays them in that order and plan 180's
 * statement meets a table that is gone. It skips rather than fails — it guards
 * itself with `to_regclass` — which is what keeps the deploy alive in either
 * merge order and is exactly right. But skipping is not granting, and the
 * ordering is this wave's, so the per-person half is this wave's too. That file
 * is what this suite pins; plan 180's is left alone, inert and harmless.
 */
describe('returns permission backfill migration, per person (plan 180 × 181)', () => {
  const MIGRATIONS_ROOT = resolve(SRC_ROOT, '../prisma/migrations');

  const sql = (() => {
    const dir = readdirSync(MIGRATIONS_ROOT).find((entry) =>
      entry.endsWith('_backfill_returns_permissions_per_user'),
    );
    if (!dir) {
      throw new Error(
        `No *_backfill_returns_permissions_per_user migration under ${MIGRATIONS_ROOT}. ` +
          "Without it plan 180's returns backfill is a no-op on every database — it " +
          'writes to a table plan 181 drops one migration earlier — so the «Повернення» ' +
          'menu entry ships to the owner and to nobody else.',
      );
    }
    return readFileSync(join(MIGRATIONS_ROOT, dir, 'migration.sql'), 'utf8');
  })();

  /** The statements only, with the explanatory comment block stripped off. */
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

    // And nothing else: every quoted `x:y` token is either a granted key or one
    // of the declared sources.
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

  it('grants to a PERSON, because that is where a grant lives now', () => {
    // The whole reason this file exists. Writing to `role_permissions` here — as
    // plan 180's version does, correctly for the world it was written in — would
    // produce a migration that fails on a fresh database and is a no-op on an
    // existing one.
    expect(statement).toContain('"user_permissions"');
    expect(statement).toContain('"user_id"');
    expect(statement).not.toContain('role_permissions');
    // …and no `allowed` predicate to get wrong in either direction: the row IS
    // the grant now, and a revocation is its absence.
    expect(statement).not.toContain('"allowed"');
  });

  it('carries the grant into TEMPLATES as well as people', () => {
    // Same argument as the customer-card split above: a template is what the
    // next hire is set up from, so a shop whose «Менеджер (як було)» offers
    // `orders:write` must offer the returns queue with it, or everybody hired
    // after the deploy comes out narrower than the colleague beside them.
    expect(statement).toContain('"permission_template_items"');
    expect(statement).toContain('"template_id"');
  });

  it('is idempotent in BOTH halves, so a restore-then-migrate cannot fail', () => {
    expect(statement.match(/ON CONFLICT[\s\S]*?DO NOTHING/g) ?? []).toHaveLength(2);
  });

  it('never names a role at all — an admin passes by level, not by row', () => {
    expect(statement).not.toContain('ADMIN');
    expect(statement).not.toContain('MANAGER');
  });
});
