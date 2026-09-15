import { dict } from "@/shared/config";

/**
 * The four access levels, exactly as `apps/store-api/src/auth/permissions/
 * access-level.ts` numbers them (TASK-476, plan 181 decision 1).
 *
 * THE NUMBER IS SERVER TRUTH AND IS NEVER RE-DERIVED HERE. `StaffUserEntity`
 * carries `level` because the alternative — reading `role === "ADMIN" &&
 * !isOwner` in the browser — is a second copy of the rule that decides who may
 * act on whom, and a second copy is the one that goes stale. These constants
 * exist so the UI can COMPARE two server-supplied numbers ("is this person below
 * me?") and label one of them, not so it can compute either.
 */
export const ACCESS_LEVEL = {
  OWNER: 3,
  ADMIN: 2,
  MANAGER: 1,
  CUSTOMER: 0,
} as const;

export type AccessLevel = (typeof ACCESS_LEVEL)[keyof typeof ACCESS_LEVEL];

/**
 * Ukrainian name of a level. An unrecognised number is printed verbatim rather
 * than rounded to the nearest known one — on a screen about who holds which
 * powers, a wrong-but-plausible label is worse than an obviously odd one.
 */
export function levelLabel(level: number): string {
  switch (level) {
    case ACCESS_LEVEL.OWNER:
      return dict.staff.levelOwner;
    case ACCESS_LEVEL.ADMIN:
      return dict.staff.levelAdmin;
    case ACCESS_LEVEL.MANAGER:
      return dict.staff.levelManager;
    case ACCESS_LEVEL.CUSTOMER:
      return dict.staff.levelCustomer;
    default:
      return dict.staff.levelUnknown(level);
  }
}

/** Badge colour for a level: owner stands out, deputy is strong, manager is soft. */
export function levelBadgeVariant(
  level: number,
): "default" | "warning" | "secondary" {
  if (level >= ACCESS_LEVEL.OWNER) return "default";
  if (level === ACCESS_LEVEL.ADMIN) return "warning";
  return "secondary";
}

/**
 * True when this level passes every `@RequirePermission` without holding a single
 * `UserPermission` row — the owner and every deputy admin.
 *
 * Mirrors `StaffPermissionsEntity.holdsEverythingByLevel`, which is what the
 * permission screen actually reads; this helper is for the places that only have
 * a level to hand (the list row, the wizard's summary).
 */
export function holdsEverythingByLevel(level: number): boolean {
  return level >= ACCESS_LEVEL.ADMIN;
}

/**
 * The level of the CURRENT session, from the two booleans the auth context gets
 * straight off `/auth/me/permissions`.
 *
 * Used for one thing only: deciding whether a control would be refused before it
 * is offered ("manage only levels below your own"). The server re-checks every
 * time — see `assertMayManage` — so this is predictability, not protection.
 */
export function actorLevel(session: {
  isOwner: boolean;
  isAdmin: boolean;
}): number {
  if (session.isOwner) return ACCESS_LEVEL.OWNER;
  if (session.isAdmin) return ACCESS_LEVEL.ADMIN;
  return ACCESS_LEVEL.MANAGER;
}

/** Human name for a staff row, falling back to the email (which always exists). */
export function staffDisplayName(person: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}): string {
  const name = [person.firstName, person.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || person.email;
}
