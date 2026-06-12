// Session entity — auth context, hook, and generated auth API hooks.
export { AuthProvider } from "./model/auth.context";
export type { AuthContextValue } from "./model/auth.context";
export { useAuth } from "./model/use-auth";

export {
  useAuthControllerLogin,
  useAuthControllerLogout,
  useAuthControllerRefresh,
} from "@/shared/api";

export type { LoginDto } from "@/shared/api";
