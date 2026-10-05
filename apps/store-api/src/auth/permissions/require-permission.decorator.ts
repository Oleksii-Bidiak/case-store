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
 * Pair with `PermissionGuard`, which reads the caller's level (`isOwner`, `role`)
 * and their own per-person grants from the database on EVERY request — no cache
 * anywhere in that path, so a revoked grant is refused on the very next request.
 * Deliberately not from the JWT: the role is baked into a 15-minute access token,
 * so a token-based check would leave a dismissed employee with full rights for up
 * to a quarter of an hour.
 *
 * Who passes: the owner and every `ADMIN` without a single granted row; anybody
 * else only with this key granted to them personally. The full decision order is
 * documented on `PermissionGuard`.
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);

/**
 * Marks a route only THE owner (`User.isOwner`) may ever reach — not "an ADMIN".
 * `PermissionGuard` consults this BEFORE its admin bypass, so a deputy ADMIN, who
 * passes every `@RequirePermission` there is, is refused here.
 *
 * Today that reserve is: `POST /api/users/:id/email` (moving a customer's login
 * to a new inbox), `DELETE /api/users/:id` (deleting a customer) and
 * `POST /api/admin/staff/:id/transfer-ownership`. Grep for `@OwnerOnly()` before
 * trusting this list — staff management itself is NOT here: since TASK-476 it is
 * `staff:write` plus the level rule on `/api/admin/staff`.
 *
 * Distinct from simply omitting `@RequirePermission`: an unmarked admin route is
 * a BUG (the guard fails closed and the catalogue test fails the build for it),
 * whereas this is a deliberate statement that the capability is not grantable at
 * all. A key can be handed over; the owner's reserve cannot.
 */
export const OwnerOnly = () => SetMetadata(OWNER_ONLY_KEY, true);
