import type { ReactNode } from "react";
import { AuthContext, type AuthContextValue } from "./auth.context";

/**
 * Test fixture for the session context (TASK-334).
 *
 * Lives in the session entity rather than `shared/test` because it has to
 * import `AuthContext`, and `shared` importing from `entities` would be an
 * upward FSD import. Not a `*.test.tsx` file, so Jest's `testMatch` ignores it.
 *
 * `can`/`canAll` are DERIVED from `isOwner` + `permissions` here exactly as the
 * real provider derives them — a fixture that let a test hand-wave `can: () =>
 * true` while passing an empty permission list would happily prove things the
 * running app does not do.
 */
export function makeAuthValue(
  overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
  const isOwner = overrides.isOwner ?? false;
  const permissions = overrides.permissions ?? [];
  const can = (permission: string) =>
    isOwner || permissions.includes(permission);

  return {
    accessToken: "test.token",
    userId: "admin-1",
    role: isOwner ? "ADMIN" : "MANAGER",
    email: "staff@example.com",
    isAuthenticated: true,
    isStaff: true,
    isInitializing: false,
    arePermissionsLoading: false,
    setTokens: jest.fn(),
    clearTokens: jest.fn(),
    ...overrides,
    // Derived last so an override of `isOwner`/`permissions` is honoured.
    isOwner,
    permissions,
    can,
    canAll: (required: readonly string[]) => required.every(can),
  };
}

/** Wrap `children` in a session context built from `overrides`. */
export function WithAuth({
  children,
  ...overrides
}: Partial<AuthContextValue> & { children: ReactNode }) {
  return (
    <AuthContext.Provider value={makeAuthValue(overrides)}>
      {children}
    </AuthContext.Provider>
  );
}
