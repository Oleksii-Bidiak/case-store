"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isAxiosError } from "axios";
import { api, setAccessToken } from "@/shared/api";

export interface AuthContextValue {
  accessToken: string | null;
  userId: string | null;
  role: string | null;
  isAuthenticated: boolean;
  /** True only for an authenticated session whose role is ADMIN. */
  isAdmin: boolean;
  /** True while the initial refresh attempt is in-flight. */
  isInitializing: boolean;
  /** Store a new access token (called after login). */
  setTokens: (accessToken: string) => void;
  /** Clear the session (called after logout or for a non-admin session). */
  clearTokens: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Bootstrap refresh: only a 401 means "no session". Anything else (429 from the
 * rate limiter, 5xx, network blip) is transient — retry once after a short
 * pause instead of kicking the admin to /login on a page reload (fix/196).
 */
async function bootstrapRefresh(): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await api.post<{ data?: { accessToken?: string } }>(
        "/api/auth/refresh",
      );
      return res.data?.data?.accessToken ?? null;
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401 || attempt >= 1) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

/** Decode a JWT payload (no verification — informational/UI use only). */
function decodeJwt(token: string): { sub?: string; role?: string } | null {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized)) as { sub?: string; role?: string };
  } catch {
    return null;
  }
}

/**
 * AuthProvider — holds the in-memory access token and admin session metadata.
 *
 * On mount it silently calls /api/auth/refresh to restore a session from the
 * HttpOnly refresh cookie. Unlike the storefront, the admin app only accepts
 * ADMIN sessions: if the restored (or set) token decodes to any other role, the
 * token is cleared immediately so a CUSTOMER can never occupy the admin shell.
 *
 * The decoded role is used purely for UI decisions (gating, redirects, display).
 * Every API call is still authorised server-side by the signed JWT.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const clearTokens = useCallback(() => {
    setAccessToken(null);
    setToken(null);
    setUserId(null);
    setRole(null);
  }, []);

  const setTokens = useCallback(
    (token: string) => {
      const claims = decodeJwt(token);

      // Reject non-admin sessions outright — the admin app is ADMIN-only.
      if (claims?.role !== "ADMIN") {
        clearTokens();
        return;
      }

      setAccessToken(token);
      setToken(token);
      setUserId(claims?.sub ?? null);
      setRole(claims.role);
    },
    [clearTokens],
  );

  // Restore the session once on mount via the refresh cookie.
  useEffect(() => {
    let active = true;

    void (async () => {
      const token = await bootstrapRefresh();
      if (active && token) {
        setTokens(token);
      }
      // token === null → no valid refresh cookie (or refresh kept failing):
      // remain signed out.
      if (active) {
        setIsInitializing(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [setTokens]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      userId,
      role,
      isAuthenticated: accessToken !== null,
      isAdmin: accessToken !== null && role === "ADMIN",
      isInitializing,
      setTokens,
      clearTokens,
    }),
    [accessToken, userId, role, isInitializing, setTokens, clearTokens],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
