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
// Imported from the module rather than the `@/shared/api` barrel: the barrel
// does not re-export the session-marker helpers yet (TASK-526 — it belongs to
// another agent's file in this wave). Same module either way.
import {
  clearSessionMarker,
  refreshSession,
  setAccessToken,
  shouldAttemptSessionRefresh,
} from "@/shared/api/instance";
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
 * Goes through {@link refreshSession} rather than calling the generated
 * `authControllerRefresh()` (TASK-463). That indirection is the whole point:
 * `instance.ts` already deduped concurrent refreshes, but this bootstrap was
 * outside its guard, so a cold page load fired two — the provider restoring the
 * session here, and the interceptor reacting to the 401s from queries that
 * started before the access token existed. Refresh rotates the cookie, and the
 * loser of that race is read as a stolen token, which revokes every session the
 * user holds. One guard, one caller, no race. See `instance.ts` for the
 * measurement.
 */
async function bootstrapRefresh(): Promise<string | null> {
  // Nothing to restore: this browser has never signed in (or signed out last).
  // Asking anyway earns a 401 that the BROWSER logs to the console — a red line
  // on every first visit that no handler in the app can swallow, because the
  // app never logged it (SF-UX-13, TASK-419). Not asking is the only fix.
  //
  // The marker is a hint, not an authority: it says nothing about whether the
  // cookie is still valid, and the server stays the only judge of that. Where
  // storage is unreadable the helper answers "true" and the old unconditional
  // behaviour is kept.
  if (!shouldAttemptSessionRefresh()) return null;

  for (let attempt = 0; ; attempt++) {
    const { accessToken, status } = await refreshSession();
    if (accessToken) return accessToken;

    // No status means the request SUCCEEDED and simply carried no token — a
    // definite "no session", not something a retry can improve.
    if (status === undefined || status === 401 || attempt >= 1) return null;

    await new Promise((resolve) => setTimeout(resolve, 2000));
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
    // Every sign-out in the app funnels through here (header, account page,
    // logout button, password change). Forget the marker too, so the next page
    // load is a silent guest instead of one doomed refresh.
    clearSessionMarker();
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
