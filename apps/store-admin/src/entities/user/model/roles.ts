import { dict } from "@/shared/config";

/**
 * The three roles a user account can hold.
 *
 * Declared here rather than taken from `UserEntityRole` because the generated
 * enum is built from the Swagger schema of `UserEntity`, which still advertises
 * only `CUSTOMER | ADMIN`. MANAGER accounts are real and are returned by the
 * API today — a UI that switched on the generated union would render every
 * manager as "Клієнт", which is exactly the wrong answer on a screen whose job
 * is to show who has which powers. Widening the backend's `@ApiProperty` is the
 * proper fix; it lives in `apps/store-api` and is out of this branch's scope
 * (noted in docs/manual-qa-pending.md).
 */
export const ROLE_VALUES = {
  CUSTOMER: "CUSTOMER",
  MANAGER: "MANAGER",
  ADMIN: "ADMIN",
} as const;

export type RoleValue = (typeof ROLE_VALUES)[keyof typeof ROLE_VALUES];

/** Roles that may enter the admin panel at all. */
export function isStaffRole(role: string): boolean {
  return role === ROLE_VALUES.ADMIN || role === ROLE_VALUES.MANAGER;
}

/**
 * Ukrainian label for a role string. Unknown values are shown verbatim rather
 * than silently mapped to "Клієнт" — a role the UI does not recognise is
 * information the operator needs, not a rounding error.
 */
export function roleLabel(role: string): string {
  switch (role) {
    case ROLE_VALUES.ADMIN:
      return dict.users.roleAdmin;
    case ROLE_VALUES.MANAGER:
      return dict.users.roleManager;
    case ROLE_VALUES.CUSTOMER:
      return dict.users.roleCustomer;
    default:
      return dict.users.roleUnknown(role);
  }
}
