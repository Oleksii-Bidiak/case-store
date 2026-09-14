import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/**
 * The level rule: you may manage only the levels BELOW your own (TASK-476, plan
 * 181, decision 1 of the 2026-09-11 B-3 session).
 *
 * ── WHY THIS IS ONE FILE AND NOT FOUR `if` BLOCKS ──────────────────────────────
 *
 * Four different doors lead to the same outcome — taking over the shop:
 *
 *   1. changing somebody's role   (demoting them IS removing them);
 *   2. setting somebody's password (you can now sign in as them);
 *   3. deactivating their account  (they are out; you are not);
 *   4. deleting their account.
 *
 * Before this file, those four doors each carried their own version of the rule,
 * and they had drifted apart in exactly the way that is invisible from any one of
 * them: three were `@OwnerOnly`, while DEACTIVATION sat under `customers:write` —
 * an ordinary grantable permission, so a manager hired to answer the phone could
 * switch off a staff account. The guard against the worst case was
 * `assertNotLastAdmin`, which asked a weaker question ("is anybody left?") than
 * the one that matters ("may THIS person act on THAT person?").
 *
 * The defect class is the drift, not any single door. So the rule is expressed
 * ONCE, here, as two total functions over levels, and every door calls them. A
 * fifth door added later gets the rule by calling `assertMayManage`, and a
 * reviewer can see in one diff whether it did.
 *
 * ── THE INVARIANTS THAT FALL OUT OF "STRICTLY BELOW" ───────────────────────────
 *
 * `assertMayManage` is `levelOf(actor) > levelOf(target)`. Strictly greater, and
 * both invariants of plan 181 follow from that single comparison:
 *
 *   **Invariant 2 — the owner always exists.** OWNER is the maximum level, and
 *   nothing is strictly above a maximum. So no caller of this function can demote,
 *   deactivate or delete the owner — not another admin, and not the owner
 *   themselves. There is no self-targeting special case to forget, and no
 *   "…unless it is you" branch for somebody to add later in good faith. Ownership
 *   moves only by transfer (TASK-478), which is a different operation with a
 *   different function. THIS is the line a future contributor would have to break
 *   to strand the shop with no owner: relax `>` to `>=` here, and every door opens
 *   at once.
 *
 *   **Invariant 3 — an admin cannot touch an admin.** Equal is not below, so a
 *   deputy is refused on every other deputy and on the owner, at all four doors,
 *   while managers and customers remain fully theirs.
 *
 * `assertMayAssign` is the same comparison against a level rather than a person:
 * nobody may hand out a level greater than OR EQUAL TO their own. An admin
 * therefore cannot create or promote another admin — only the owner appoints
 * admins — and nobody at all can assign OWNER, because that would require a level
 * above the maximum.
 *
 * ── WHAT THIS FILE DELIBERATELY IS NOT ────────────────────────────────────────
 *
 * Pure: no Nest injection, no Prisma, no request. It takes two plain objects and
 * either returns or throws, which is what makes the whole rule provable in
 * `access-level.spec.ts` without a database or an HTTP server — and what makes it
 * cheap enough to call at every door instead of "just this once".
 *
 * It is also NOT the permission check. Permissions answer "what may this person
 * do at all" (`PermissionGuard`, `staff:write`); levels answer "to whom". A route
 * needs both, in that order: the guard first, then the level assert inside the
 * service where the target is known.
 */

/**
 * Who outranks whom. The numbers are ordered, not identifiers — comparisons are
 * the only thing anybody should do with them, and the only thing this file does.
 */
export enum AccessLevel {
  CUSTOMER = 0,
  MANAGER = 1,
  ADMIN = 2,
  OWNER = 3,
}

/** The minimum an account must expose for the rule to rank it. */
export interface LevelledAccount {
  id: string;
  role: UserRole;
  isOwner: boolean;
}

/** Ukrainian-free, target-free refusals: they state the rule, never the person. */
const MANAGE_REFUSED =
  'You may only manage accounts below your own access level. ' +
  'The shop owner cannot be changed, deactivated or deleted by anyone, including themselves.';

const ASSIGN_REFUSED =
  'You may only assign an access level below your own. ' +
  'Only the shop owner appoints administrators, and ownership itself moves only by transfer.';

/**
 * The level of an existing account.
 *
 * `isOwner` is consulted FIRST and the role second. The flag is the level; the
 * role is what the account may do once it is inside. Reading the role first would
 * mean a hand-run `UPDATE users SET role='MANAGER'` quietly demoted the owner,
 * which is precisely the state the partial unique index exists to make impossible.
 */
export function levelOf(account: Pick<LevelledAccount, 'role' | 'isOwner'>): AccessLevel {
  if (account.isOwner) {
    return AccessLevel.OWNER;
  }
  return levelOfRole(account.role);
}

/**
 * The level a bare role carries — the form the role-change DTO arrives in, before
 * any account exists to hold it.
 *
 * There is deliberately no `UserRole` that maps to OWNER: ownership is a flag, not
 * a role (plan 178, decision 1), so no request body can ever ask for it.
 */
export function levelOfRole(role: UserRole): AccessLevel {
  switch (role) {
    case UserRole.ADMIN:
      return AccessLevel.ADMIN;
    case UserRole.MANAGER:
      return AccessLevel.MANAGER;
    default:
      return AccessLevel.CUSTOMER;
  }
}

/**
 * May `actor` act on `target`'s ACCOUNT at all — role, password, status, delete?
 *
 * Strictly below, for the reasons in the file docblock. Throws rather than
 * returning a boolean because every call site's correct response to "no" is
 * identical and immediate, and a boolean is one forgotten `if` away from being
 * ignored.
 *
 * @throws ForbiddenException when the target is at or above the actor's level.
 */
export function assertMayManage(
  actor: Pick<LevelledAccount, 'role' | 'isOwner'>,
  target: Pick<LevelledAccount, 'role' | 'isOwner'>,
): void {
  if (levelOf(actor) <= levelOf(target)) {
    throw new ForbiddenException(MANAGE_REFUSED);
  }
}

/**
 * May `actor` hand out `level` — by creating an account at it, or by promoting
 * somebody to it?
 *
 * Separate from {@link assertMayManage} because the two answer different
 * questions and a role change asks BOTH: an admin may manage a manager
 * (`assertMayManage` passes) and still must not promote that manager to admin
 * (`assertMayAssign` refuses). Collapsing them would let exactly that through.
 *
 * @throws ForbiddenException when the level is at or above the actor's own.
 */
export function assertMayAssign(
  actor: Pick<LevelledAccount, 'role' | 'isOwner'>,
  level: AccessLevel,
): void {
  if (levelOf(actor) <= level) {
    throw new ForbiddenException(ASSIGN_REFUSED);
  }
}
