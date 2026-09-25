// Session entity — auth context, hook, and generated auth API hooks.
export { AuthProvider } from "./model/auth.context";
export type { AuthContextValue } from "./model/auth.context";
export { useAuth } from "./model/use-auth";
// TASK-725: the one set of observer options for `useGetMyPermissions`.
export { MY_PERMISSIONS_QUERY } from "./model/my-permissions-query";
// TASK-639: one clean refusal for a section the session has no right to.
export { PermissionGate } from "./ui/permission-gate";

export {
  useAuthControllerLogin,
  useAuthControllerLogout,
  useAuthControllerRefresh,
  // TASK-333: one change-password mechanism, shared by storefront and admin.
  useAuthControllerChangePassword,
  // TASK-334: the frontend's source of truth for effective permissions.
  useGetMyPermissions,
  getGetMyPermissionsQueryKey,
} from "@/shared/api";

export type { LoginDto, ChangePasswordDto } from "@/shared/api";
