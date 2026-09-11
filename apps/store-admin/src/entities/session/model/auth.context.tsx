"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  refreshSession,
  setAccessToken,
  useGetMyPermissions,
  userControllerGetProfile,
} from "@/shared/api";
import {
  ADMIN_UI_SESSION_COOKIE,
  ADMIN_UI_SESSION_MAX_AGE_SECONDS,
} from "@/shared/config/admin-ui-session";

/**
 * Roles that may occupy the admin shell at all (TASK-334).
 *
 * MANAGER was added here as the very first step of the RBAC work: until it was,
 * `setTokens` cleared any non-ADMIN token on arrival and `AdminShellGuard`
 * bounced the session to /login, so a manager account could be created, granted
 * permissions, and still never see a single screen.
 *
 * This is a *shell* gate, not an authorisation decision — it only answers "does
 * this person belong in the admin app". What they may then do comes from
 * `permissions`, which is resolved server-side per request.
 */
const STAFF_ROLES: ReadonlySet<string> = new Set(["ADMIN", "MANAGER"]);

/** How long an effective-permission answer is trusted before a refetch. */
const PERMISSIONS_STALE_MS = 30_000;

export interface AuthContextValue {
  accessToken: string | null;
  userId: string | null;
  role: string | null;
  /**
   * Signed-in admin's email from a side-channel `/api/users/me` fetch
   * (TASK-255). `null` before the fetch resolves, after a fetch failure, and
   * when signed out — purely informational, never affects session state.
   */
  email: string | null;
  isAuthenticated: boolean;
  /** True for an authenticated staff session (ADMIN or MANAGER). */
  isStaff: boolean;
  /**
   * True only for ADMIN — the shop owner, who is never subject to the
   * permission matrix and is the only role that may manage users, edit the
   * matrix, or read the action log.
   */
  isOwner: boolean;
  /** True while the initial refresh attempt is in-flight. */
  isInitializing: boolean;
  /**
   * Effective permission keys for this session, resolved from the DATABASE via
   * `GET /api/auth/me/permissions` — never decoded from the JWT, whose role
   * claim is a up-to-15-minute-old snapshot. Empty for the owner, who holds
   * everything implicitly (`isOwner` / `can()` cover that).
   */
  permissions: string[];
  /** True until the first effective-permission answer has arrived. */
  arePermissionsLoading: boolean;
  /**
   * UI-only convenience: may this session see the control for `permission`?
   *
   * A hidden button is not a security boundary — the server guard is. This
   * exists so the panel a manager sees matches what the API will actually let
   * them do, not so it can replace the guard.
   */
  can: (permission: string) => boolean;
  /** True when every one of `permissions` is held. */
  canAll: (permissions: readonly string[]) => boolean;
  /** Store a new access token (called after login). */
  setTokens: (accessToken: string) => void;
  /** Clear the session (called after logout or for a non-staff session). */
  clearTokens: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Bootstrap refresh: only a 401 means "no session". Anything else (429 from the
 * rate limiter, 5xx, network blip) is transient — retry once after a short
 * pause instead of kicking the admin to /login on a page reload (fix/196).
 *
 * Goes through {@link refreshSession} rather than calling the generated
 * `authControllerRefresh()` (TASK-463). That indirection is the whole point:
 * `instance.ts` already deduped concurrent refreshes, but this bootstrap was
 * outside its guard, so a cold page load fired two — the provider restoring the
 * session here, and the interceptor reacting to the 401s from queries that
 * started before the access token existed. Refresh rotates the cookie and the
 * loser of that race is read as a stolen token, which revokes every session the
 * user holds. One guard, one caller, no race. See `instance.ts` for the
 * measurement.
 */
async function bootstrapRefresh(): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    const { accessToken, status } = await refreshSession();
    if (accessToken) return accessToken;

    // No status means the request SUCCEEDED and simply carried no token — a
    // definite "no session", not something a retry can improve.
    if (status === undefined || status === 401 || attempt >= 1) return null;

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/**
 * Write (or expire) the `admin_ui_session` marker cookie.
 *
 * Deliberately NOT HttpOnly — this is client-side state, and it is not a secret:
 * it carries no token and proves nothing. Its only job is to let `proxy.ts`
 * (which cannot see the API's HttpOnly refresh cookie, that being scoped to a
 * different host) skip serving the dashboard shell to a browser with no session
 * at all. See shared/config/admin-ui-session.ts for the full reasoning.
 */
function writeAdminUiSessionMarker(present: boolean): void {
  if (typeof document === "undefined") {
    return;
  }

  const secure = window.location.protocol === "https:" ? "; secure" : "";
  const maxAge = present ? ADMIN_UI_SESSION_MAX_AGE_SECONDS : 0;

  document.cookie = `${ADMIN_UI_SESSION_COOKIE}=${present ? "1" : ""}; path=/; max-age=${maxAge}; samesite=strict${secure}`;
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
 * HttpOnly refresh cookie. The admin app accepts only STAFF sessions (ADMIN or
 * MANAGER): if the restored (or set) token decodes to any other role, the token
 * is cleared immediately so a CUSTOMER can never occupy the admin shell.
 *
 * The decoded role is used purely for the shell gate. What the session may
 * actually DO comes from `GET /api/auth/me/permissions` — a database read, not
 * a token claim, so a permission revoked a minute ago is gone here on the next
 * fetch (refetch on window focus, 30 s staleness) rather than at the end of the
 * token's 15-minute life. Every API call is still authorised server-side.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tokenRole, setTokenRole] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const clearTokens = useCallback(() => {
    setAccessToken(null);
    setToken(null);
    setUserId(null);
    setTokenRole(null);
    setEmail(null);
    writeAdminUiSessionMarker(false);
  }, []);

  const setTokens = useCallback(
    (token: string) => {
      const claims = decodeJwt(token);

      // Reject non-staff sessions outright — a shopper's valid token must not
      // buy a seat in the admin shell.
      if (!claims?.role || !STAFF_ROLES.has(claims.role)) {
        clearTokens();
        return;
      }

      setAccessToken(token);
      setToken(token);
      setUserId(claims.sub ?? null);
      setTokenRole(claims.role);
      writeAdminUiSessionMarker(true);
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
      // remain signed out, and expire the `admin_ui_session` marker. Without
      // this a marker left over from a revoked or expired session would keep
      // letting the dashboard shell through the proxy for its full 7 days —
      // harmless (the API still 401s) but pointlessly so.
      if (active && !token) {
        clearTokens();
      }
      if (active) {
        setIsInitializing(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [setTokens, clearTokens]);

  // TASK-255: light profile fetch for the header identity. Keyed on
  // `accessToken` so it re-runs on bootstrap restore, login, and every
  // refresh-token rotation. A failure only leaves `email` null — it must never
  // tear down the session (isAuthenticated/isStaff are untouched). No fetch
  // while signed out: the token only ever becomes null via clearTokens(),
  // which already resets `email`.
  useEffect(() => {
    if (accessToken === null) {
      return;
    }

    let active = true;

    void (async () => {
      try {
        const res = await userControllerGetProfile();
        if (active) {
          setEmail(res.data.email ?? null);
        }
      } catch {
        if (active) {
          setEmail(null);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [accessToken]);

  // TASK-334: the frontend's single source of truth for what this session may
  // do. `retry: false` because the only interesting failure (401) is not worth
  // retrying, and a failed fetch degrades to "no permissions" — the safe
  // direction: a manager sees an empty panel rather than links that 403.
  const { data: permissionsData, isPending: permissionsPending } =
    useGetMyPermissions({
      query: {
        enabled: accessToken !== null,
        staleTime: PERMISSIONS_STALE_MS,
        refetchOnWindowFocus: true,
        retry: false,
      },
    });

  const effective = permissionsData?.data;
  const permissions = useMemo(
    () => effective?.permissions ?? [],
    [effective?.permissions],
  );

  // The server's answer wins over the token claim once it arrives; before that
  // the JWT role keeps the shell from flashing a redirect.
  const role = effective?.role ?? tokenRole;
  const isStaff =
    accessToken !== null && role !== null && STAFF_ROLES.has(role);
  const isOwner =
    effective?.isOwner ?? (accessToken !== null && role === "ADMIN");

  const can = useCallback(
    (permission: string) => isOwner || permissions.includes(permission),
    [isOwner, permissions],
  );

  const canAll = useCallback(
    (required: readonly string[]) => required.every((key) => can(key)),
    [can],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      userId,
      role,
      email,
      isAuthenticated: accessToken !== null,
      isStaff,
      isOwner,
      isInitializing,
      permissions,
      arePermissionsLoading: accessToken !== null && permissionsPending,
      can,
      canAll,
      setTokens,
      clearTokens,
    }),
    [
      accessToken,
      userId,
      role,
      email,
      isStaff,
      isOwner,
      isInitializing,
      permissions,
      permissionsPending,
      can,
      canAll,
      setTokens,
      clearTokens,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
