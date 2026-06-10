// Session entity — auth context, hook, and generated auth API hooks.
export { AuthProvider } from "./model/auth.context";
export type { AuthContextValue } from "./model/auth.context";
export { useAuth } from "./model/use-auth";

export {
  useAuthControllerLogin,
  useAuthControllerRegister,
  useAuthControllerLogout,
  useAuthControllerRefresh,
} from "@/shared/api/generated/auth/auth";

export type { LoginDto, RegisterDto } from "@/shared/api/generated/models";
