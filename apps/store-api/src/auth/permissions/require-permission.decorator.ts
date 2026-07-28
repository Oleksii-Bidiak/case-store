import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permission.catalog';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';
export const OWNER_ONLY_KEY = 'ownerOnly';

/**
 * Marks an admin route as requiring a specific permission (TASK-334).
 *
 * ```ts
 * @RequirePermission('products:write')
 * @Patch(':id')
 * update(...) {}
 * ```
 *
 * The argument is typed against the code catalogue, so a typo does not compile —
 * which matters more than it sounds: a permission string that matches nothing is
 * a route nobody can reach, or (with a permissive guard) one everybody can.
 *
 * Pair with `PermissionGuard`, which resolves the caller's effective permissions
 * from the database on EVERY request (cached in Redis, invalidated when the
 * matrix changes). Deliberately not from the JWT: the role is baked into a
 * 15-minute access token, so a token-based check would leave a dismissed employee
 * with full rights for up to a quarter of an hour.
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);

/**
 * Marks a route only the owner (ADMIN) may ever reach — user management, the
 * permission matrix itself, anything that could be used to escalate.
 *
 * Distinct from simply omitting `@RequirePermission`: an unmarked admin route is
 * a BUG (the catalogue test fails the build for it), whereas this is a deliberate
 * statement that the capability is not grantable at all. If it were grantable, a
 * manager could grant themselves everything and the matrix would be decorative.
 */
export const OwnerOnly = () => SetMetadata(OWNER_ONLY_KEY, true);
