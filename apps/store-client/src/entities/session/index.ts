// Session entity — auth context, hook, and generated auth API hooks.
export { AuthProvider } from "./model/auth.context";
export type { AuthContextValue } from "./model/auth.context";
export { useAuth } from "./model/use-auth";

export {
  useAuthControllerLogin,
  useAuthControllerRegister,
  useAuthControllerLogout,
  useAuthControllerRefresh,
  useAuthControllerRequestPasswordReset,
  useAuthControllerConfirmPasswordReset,
  // TASK-333 — change your own password (requires the current one).
  useAuthControllerChangePassword,
  // TASK-342 — email verification: request a link, confirm a token.
  useAuthControllerRequestEmailVerification,
  useAuthControllerConfirmEmailVerification,
} from "@/shared/api/generated/auth/auth";

export type {
  LoginDto,
  RegisterDto,
  RequestPasswordResetDto,
  ConfirmPasswordResetDto,
  ChangePasswordDto,
  ConfirmEmailVerificationDto,
} from "@/shared/api/generated/models";
