"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { setAccessToken } from "@/shared/api";
import { authControllerRefresh } from "@/shared/api/generated/auth/auth";
import { getGetCartQueryKey } from "@/shared/api/generated/cart/cart";
import { getGetWishlistQueryKey } from "@/shared/api/generated/wishlist/wishlist";

export interface AuthContextValue {
  accessToken: string | null;
  userId: string | null;
  role: string | null;
  isAuthenticated: boolean;
  /** True while the initial refresh attempt is in-flight. */
  isInitializing: boolean;
  /** Store a new access token (called after login/register). */
  setTokens: (accessToken: string) => void;
  /** Clear the session (called after logout). */
  clearTokens: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Bootstrap refresh: only a 401 means "no session". Anything else (429 from the
 * rate limiter, 5xx, network blip) is transient — retry once after a short
 * pause instead of silently signing the user out (fix/196).
 *
 * Calls the Orval-generated operation imperatively (it is a plain function, not a
 * hook — this runs from an effect, outside React Query). `customInstance` already
 * unwraps the Axios response, so the value here IS the `{ data }` envelope: one
 * level of unwrapping, not two.
 */
async function bootstrapRefresh(): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const envelope = await authControllerRefresh();
      return envelope.data?.accessToken ?? null;
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401 || attempt >= 1) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

/** Decode a JWT payload (no verification — informational use only). */
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
 * AuthProvider — holds the in-memory access token and session metadata.
 * On mount it silently calls /api/auth/refresh to restore a session from the
 * HttpOnly refresh cookie (survives page reloads without localStorage).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [accessToken, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const setTokens = useCallback((token: string) => {
    setAccessToken(token);
    const claims = decodeJwt(token);
    setToken(token);
    setUserId(claims?.sub ?? null);
    setRole(claims?.role ?? null);
  }, []);

  const clearTokens = useCallback(() => {
    setAccessToken(null);
    setToken(null);
    setUserId(null);
    setRole(null);
  }, []);

  // Restore the session once on mount via the refresh cookie.
  useEffect(() => {
    let active = true;

    void (async () => {
      const token = await bootstrapRefresh();
      if (active && token) {
        setTokens(token);
        // Session restored on reload: the cart/wishlist queries may already
        // have fired as a guest during this bootstrap window. Invalidate them
        // so they refetch with the now-authenticated identity and surface the
        // merged user cart/wishlist instead of the empty guest one created
        // mid-bootstrap (TASK-118-C; wishlist mirrors this for TASK-076).
        void queryClient.invalidateQueries({
          queryKey: getGetCartQueryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: getGetWishlistQueryKey(),
        });
      }
      // token === null → no valid refresh cookie (or refresh kept failing):
      // remain a guest. No cart invalidation: the guest cart fetched after
      // bootstrap is already the correct identity.
      if (active) {
        setIsInitializing(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [setTokens, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      userId,
      role,
      isAuthenticated: accessToken !== null,
      isInitializing,
      setTokens,
      clearTokens,
    }),
    [accessToken, userId, role, isInitializing, setTokens, clearTokens],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
