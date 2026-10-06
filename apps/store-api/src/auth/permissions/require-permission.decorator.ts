import { applyDecorators, SetMetadata } from '@nestjs/common';
import type { Permission } from './permission.catalog';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';
export const OWNER_ONLY_KEY = 'ownerOnly';
/** Extra keys that ALSO open a route marked with {@link RequireAnyPermission}. */
export const ALSO_ACCEPTED_PERMISSIONS_KEY = 'alsoAcceptedPermissions';

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
 * Marks an admin route that ANY ONE of the listed permissions opens (TASK-655).
 *
 * ```ts
 * @RequireAnyPermission('categories:write', 'categories:delete')
 * @Get(':id')
 * findById(...) {}
 * ```
 *
 * For READ routes that two separately grantable capabilities both depend on: a
 * manager who may delete categories but not edit them still has to see the tree
 * and the card the delete dialog lives on. Never put it on a write route — there
 * each capability gets its own key on its own handler, as category `DELETE` does.
 *
 * The first key is stored under {@link REQUIRE_PERMISSION_KEY} exactly as
 * `@RequirePermission` stores it, so every reader of that key (the audit
 * interceptor, the catalogue and audit-label specs) keeps seeing one string; the
 * rest go under {@link ALSO_ACCEPTED_PERMISSIONS_KEY}, read only by
 * `PermissionGuard` for a person holding granted rows. A handler-level annotation
 * overrides the class-level one as a unit, alternatives included.
 */
export const RequireAnyPermission = (first: Permission, ...alsoAccepted: Permission[]) =>
  applyDecorators(
    SetMetadata(REQUIRE_PERMISSION_KEY, first),
    SetMetadata(ALSO_ACCEPTED_PERMISSIONS_KEY, alsoAccepted),
  );

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
