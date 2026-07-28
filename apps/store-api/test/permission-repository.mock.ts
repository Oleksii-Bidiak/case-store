import { RolePermission, UserRole } from '@prisma/client';
import type { PermissionActor } from '../src/auth/permissions';

/**
 * Shared `PermissionRepository` double for the e2e suites (TASK-334).
 *
 * WHY EVERY ADMIN E2E SPEC NEEDS THIS. `PermissionGuard` resolves the caller's
 * CURRENT role from the database on every admin request rather than trusting the
 * role baked into their 15-minute access token — that is the whole point of the
 * design (a dismissed employee loses access on their next request, not a quarter
 * of an hour later). The e2e suites mint JWTs for user ids that exist in no
 * database and mock `PrismaService` wholesale, so without this double the guard
 * correctly concludes "no such user" and refuses every admin request.
 *
 * The default {@link roleFromTestUserId} reads the role from the id the spec
 * already chose (`admin-e2e-1`, `customer-e2e-1`, `manager-rbac-1`), so a suite
 * needs one `.overrideProvider(...)` line and no other change. Pass an explicit
 * resolver when a suite's ids do not say what they are.
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

export interface PermissionRepositoryMockOptions {
  /** Override the id→role mapping. Return null to simulate a deleted/banned account. */
  roleFor?: (userId: string) => UserRole | null;
  /** Grants per role. Absent = the role holds nothing (matching the real default-deny). */
  grants?: Partial<Record<UserRole, string[]>>;
}

export interface PermissionRepositoryMock {
  findActor(userId: string): Promise<PermissionActor | null>;
  findGrantedByRole(role: UserRole): Promise<RolePermission[]>;
  findAll(): Promise<RolePermission[]>;
  replaceRoleGrants(role: UserRole, permissions: string[]): Promise<void>;
}

function toRows(role: UserRole, permissions: string[]): RolePermission[] {
  return permissions.map((permission, index) => ({
    id: `${role}-${index}`,
    role,
    permission,
    allowed: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));
}

export function createPermissionRepositoryMock(
  options: PermissionRepositoryMockOptions = {},
): PermissionRepositoryMock {
  const roleFor = options.roleFor ?? roleFromTestUserId;

  // STATEFUL on purpose: `replaceRoleGrants` really replaces, so a suite can
  // drive the matrix through the real `PUT /api/admin/permissions` endpoint and
  // then assert what the NEXT request sees. Faking the write would test the
  // assertion instead of the cache invalidation it depends on.
  const grants = new Map<UserRole, string[]>(
    Object.entries(options.grants ?? {}).map(([role, keys]) => [role as UserRole, [...keys]]),
  );

  return {
    findActor(userId: string): Promise<PermissionActor | null> {
      const role = roleFor(userId);
      return Promise.resolve(
        role === null ? null : { id: userId, email: `${userId}@test.local`, role },
      );
    },
    findGrantedByRole(role: UserRole): Promise<RolePermission[]> {
      return Promise.resolve(toRows(role, grants.get(role) ?? []));
    },
    findAll(): Promise<RolePermission[]> {
      return Promise.resolve([...grants.entries()].flatMap(([role, keys]) => toRows(role, keys)));
    },
    replaceRoleGrants(role: UserRole, permissions: string[]): Promise<void> {
      grants.set(role, [...permissions]);
      return Promise.resolve();
    },
  };
}
