import { UserRole } from '@prisma/client';
import type { PermissionActor } from '../src/auth/permissions';

/**
 * Shared `PermissionRepository` double for the e2e suites (TASK-334, rebuilt on
 * per-person permissions in TASK-475).
 *
 * WHY EVERY ADMIN E2E SPEC NEEDS THIS. `PermissionGuard` resolves the caller's
 * CURRENT level and rights from the database on every admin request rather than
 * trusting the role baked into their 15-minute access token — that is the whole
 * point of the design (a dismissed employee loses access on their next request,
 * not a quarter of an hour later). The e2e suites mint JWTs for user ids that
 * exist in no database and mock `PrismaService` wholesale, so without this double
 * the guard correctly concludes "no such user" and refuses every admin request.
 *
 * The default {@link roleFromTestUserId} reads the role from the id the spec
 * already chose (`admin-e2e-1`, `customer-e2e-1`, `manager-rbac-1`), so a suite
 * needs one `.overrideProvider(...)` line and no other change. Pass an explicit
 * resolver when a suite's ids do not say what they are.
 *
 * THE OPTIONS ARE STILL SPELLED PER ROLE, AND THE ROLE MATRIX IS GONE. Thirty-four
 * suites pass `{ grants: { MANAGER: [...] } }` and none of them are about the
 * access model — they are about banners, carousels and returns, and they use this
 * to say "this caller can do X". That sentence survived the rewrite; only its
 * implementation changed, so the option keeps its shape and the grants are handed
 * to the ACTOR rather than looked up by role. Changing the signature would have
 * meant editing every one of those suites to express the same thing differently.
 *
 * DELIBERATELY NOT `jest.fn()`. Several suites call `jest.resetAllMocks()` in
 * `afterEach`, which strips implementations from every jest mock in the process
 * — including this one, after which `findActor` returns `undefined` and every
 * admin request in the suite 403s from the SECOND test onwards. Plain functions
 * are invisible to that reset. A suite that needs to vary the behaviour uses
 * `jest.spyOn(stub, 'findActor')`, which restores the real implementation after
 * its `…Once` override is spent.
 */

/**
 * Derive a test user's role from their id.
 *
 * Deliberately conservative: anything that does not announce itself as staff is
 * a CUSTOMER, so a typo'd id produces a 403 (a failing test) rather than an
 * accidental grant (a passing one that proves nothing).
 */
export function roleFromTestUserId(userId: string): UserRole | null {
  if (/admin/i.test(userId)) return UserRole.ADMIN;
  if (/manager/i.test(userId)) return UserRole.MANAGER;
  return UserRole.CUSTOMER;
}

/**
 * Is this test id the OWNER, as opposed to a deputy admin?
 *
 * Every existing suite's `admin-*` id must keep meaning "the person who can do
 * absolutely everything", because that is what their `@OwnerOnly` assertions were
 * written against — before TASK-475 `role === ADMIN` WAS the owner. So an ADMIN id
 * is the owner unless a suite says otherwise, and a suite that wants a deputy (an
 * admin who is refused the owner's reserve) says so with {@link
 * PermissionRepositoryMockOptions.isOwnerFor}.
 */
export function ownerFromTestUserId(userId: string): boolean {
  return /admin/i.test(userId);
}

export interface PermissionRepositoryMockOptions {
  /** Override the id→role mapping. Return null to simulate a deleted/banned account. */
  roleFor?: (userId: string) => UserRole | null;
  /** Override which ids own the shop. Default: any id matching /admin/i. */
  isOwnerFor?: (userId: string, role: UserRole) => boolean;
  /**
   * What each role's people hold, as the suites have always spelled it. Absent =
   * they hold nothing, matching the real default-deny. Entries for ADMIN are
   * pointless rather than wrong — an admin passes every permission by level.
   */
  grants?: Partial<Record<UserRole, string[]>>;
}

export interface PermissionRepositoryMock {
  findActor(userId: string): Promise<PermissionActor | null>;
  /**
   * Change what a role's people hold, mid-suite.
   *
   * For the suites that walk a caller UP a ladder of permissions in one describe
   * — "refused with nothing, allowed once `returns:read` is granted, still
   * refused the write, allowed once `returns:write` is" — which is the only way
   * to prove a key is enforced rather than merely declared.
   *
   * Before TASK-475 those suites reached for `PermissionService.setRoleGrants`,
   * because the role matrix was cached in Redis for 60 seconds and writing to the
   * repository double left the stale set cached, so the next request was answered
   * from a matrix nobody was looking at. Both halves of that are gone: there is no
   * matrix and no cache, `findActor` returns the person's rights with the person,
   * and a set changed here is live on the very next request. So the mutator
   * belongs on the double, where the state actually lives.
   */
  setGrants(role: UserRole, permissions: readonly string[]): void;
}

export function createPermissionRepositoryMock(
  options: PermissionRepositoryMockOptions = {},
): PermissionRepositoryMock {
  const roleFor = options.roleFor ?? roleFromTestUserId;
  const isOwnerFor = options.isOwnerFor ?? ((userId: string) => ownerFromTestUserId(userId));

  const grants = new Map<UserRole, string[]>(
    Object.entries(options.grants ?? {}).map(([role, keys]) => [role as UserRole, [...keys]]),
  );

  return {
    findActor(userId: string): Promise<PermissionActor | null> {
      const role = roleFor(userId);
      if (role === null) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        id: userId,
        email: `${userId}@test.local`,
        role,
        isOwner: isOwnerFor(userId, role),
        permissions: new Set(grants.get(role) ?? []),
      });
    },

    setGrants(role: UserRole, permissions: readonly string[]): void {
      grants.set(role, [...permissions]);
    },
  };
}
