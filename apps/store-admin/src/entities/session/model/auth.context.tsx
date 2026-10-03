"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clearSessionMarker,
  onSessionExpired,
  refreshSession,
  setAccessToken,
  shouldAttemptSessionRefresh,
  useGetMyPermissions,
  userControllerGetProfile,
} from "@/shared/api";
import {
  ADMIN_UI_SESSION_COOKIE,
  ADMIN_UI_SESSION_MAX_AGE_SECONDS,
} from "@/shared/config/admin-ui-session";
import { MY_PERMISSIONS_QUERY } from "./my-permissions-query";

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
   * True for the ONE account that owns the shop (`User.isOwner`), straight from
   * the server — never inferred from the role (TASK-475).
   *
   * Gates the owner's reserve only: transferring ownership, appointing or
   * removing an admin, and any action on an admin's own account. Do NOT use it
   * to mean "senior staff" — a deputy admin holds every permission and answers
   * false here.
   */
  isOwner: boolean;
  /**
   * True for any ADMIN, owner or deputy: this session holds every permission in
   * the catalogue without having been granted one.
   *
   * Separate from {@link isOwner} because they hide different things. Collapsing
   * them is precisely the bug this release fixed: the context used to fall back
   * to `role === "ADMIN"` when the server answer had not arrived, which told a
   * deputy they owned the shop and offered them buttons that can only 403.
   */
  isAdmin: boolean;
  /** True while the initial refresh attempt is in-flight. */
  isInitializing: boolean;
  /**
   * Effective permission keys for this session, resolved from the DATABASE via
   * `GET /api/auth/me/permissions` — never decoded from the JWT, whose role
   * claim is a up-to-15-minute-old snapshot. For any ADMIN the server returns
   * the whole catalogue, so `can()` answers true without a special case.
   */
  permissions: string[];
  /** True until the first effective-permission answer has arrived. */
  arePermissionsLoading: boolean;
  /**
   * TASK-1014: `GET /auth/me/permissions` FAILED and there is no earlier answer
   * to fall back on, so `can()` answers false for everything — the owner's too.
   * The shell shows why instead of a silently empty panel. Not set for a 401:
   * that is the session ending, which {@link isSessionExpired} reports.
   */
  permissionsFailed: boolean;
  /** True while {@link retryPermissions} is in flight. */
  isRetryingPermissions: boolean;
  /** Ask for the effective permissions again («Повторити»). */
  retryPermissions: () => void;
  /**
   * TASK-528 + TASK-974: the session ended while the person was inside the
   * panel — a request answered 401 and so did the refresh it triggered. Cleared
   * by the next {@link setTokens}. Kept through {@link clearTokens} on purpose:
   * the shell clears the dead session on the way to /login and must not then
   * read "signed out" as "never signed in" and redirect a second time.
   */
  isSessionExpired: boolean;
  /** The email the expired session belonged to — prefilled on /login. */
  expiredSessionEmail: string | null;
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
 *
 * Skipped outright when this browser holds no session (TASK-528): asking anyway
 * earns a 401 that the BROWSER logs to the console on every visit to /login —
 * a red line no handler in the app can swallow, because the app never logged
 * it. The marker is a hint, not an authority: it says nothing about whether the
 * cookie is still valid, and the server stays the only judge of that. Where
 * storage is unreadable the helper answers "true" and the old unconditional
 * behaviour is kept.
 */
async function bootstrapRefresh(): Promise<string | null> {
  if (!shouldAttemptSessionRefresh() && !hasAdminUiSessionCookie()) {
    return null;
  }

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

/**
 * Is the `admin_ui_session` marker cookie set? Read ONLY as a fallback for the
 * localStorage session marker in {@link bootstrapRefresh}.
 *
 * Why a fallback is needed at all: the localStorage marker arrived with
 * TASK-528, so an operator who signed in BEFORE that deploy holds a live
 * refresh cookie and this cookie, but no localStorage marker. Without the
 * fallback the first page load after the deploy would skip the refresh and send
 * every signed-in operator back to /login once. The two markers are written
 * together on every sign-in, so after that first restore they agree.
 */
function hasAdminUiSessionCookie(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.cookie
    .split(";")
    .some((pair) => pair.trim() === `${ADMIN_UI_SESSION_COOKIE}=1`);
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
 * HttpOnly refresh cookie — only when this browser holds a session marker (or
 * cannot tell), so /login without a session logs no 401 (TASK-528). The admin app accepts only STAFF sessions (ADMIN or
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
  const [isSessionExpired, setSessionExpired] = useState(false);
  const [expiredSessionEmail, setExpiredSessionEmail] = useState<string | null>(
    null,
  );

  // Null this tab's copy of the session. Shared by an explicit sign-out and by a
  // bootstrap that could not restore one — which differ only in the marker below.
  const dropSessionState = useCallback(() => {
    setAccessToken(null);
    setToken(null);
    setUserId(null);
    setTokenRole(null);
    setEmail(null);
    writeAdminUiSessionMarker(false);
  }, []);

  const clearTokens = useCallback(() => {
    dropSessionState();
    // Every sign-out funnels through here (the logout button, a non-staff
    // token). Forget the session marker too, so the next page load — /login
    // included — makes no doomed refresh and logs no 401 (TASK-528).
    clearSessionMarker();
  }, [dropSessionState]);

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
      setSessionExpired(false);
      setExpiredSessionEmail(null);
      writeAdminUiSessionMarker(true);
    },
    [clearTokens],
  );

  // TASK-528 + TASK-974: the interceptor reports a session that could not be
  // refreshed. Only a session this tab actually HOLDS can expire — a 401 on the
  // login page, or before the bootstrap restored anything, is not an expiry.
  // Read through a ref so the subscription is made once, not per token change.
  const liveSessionRef = useRef<{ token: string | null; email: string | null }>(
    { token: null, email: null },
  );
  useEffect(() => {
    liveSessionRef.current = { token: accessToken, email };
  }, [accessToken, email]);

  useEffect(
    () =>
      onSessionExpired(() => {
        const live = liveSessionRef.current;
        if (live.token === null) {
          return;
        }
        setExpiredSessionEmail(live.email);
        setSessionExpired(true);
      }),
    [],
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
      //
      // `dropSessionState`, NOT `clearTokens` (TASK-528): the latter also
      // forgets the localStorage session marker, and a bootstrap that gave up
      // on a 429/5xx/network blip must keep it so the next page load tries
      // again. A 401 has already cleared the marker inside `refreshSession`, so
      // both cases end up right.
      if (active && !token) {
        dropSessionState();
      }
      if (active) {
        setIsInitializing(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [setTokens, dropSessionState]);

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
  // do. The observer options are shared with every other reader of this key
  // (see `my-permissions-query.ts` for why they must match).
  const {
    data: permissionsData,
    isPending: permissionsPending,
    isError: permissionsErrored,
    error: permissionsError,
    isFetching: permissionsFetching,
    refetch: refetchPermissions,
  } = useGetMyPermissions({
    query: { ...MY_PERMISSIONS_QUERY, enabled: accessToken !== null },
  });

  const effective = permissionsData?.data;

  // TASK-1014. Only when there is NO answer to fall back on: a failed
  // background refetch keeps the last good permissions in the cache, and
  // blanking a working panel over a focus-refetch blip would be the very
  // silence this flag exists to explain, the other way round.
  const permissionsFailed =
    accessToken !== null &&
    permissionsErrored &&
    effective === undefined &&
    permissionsError?.response?.status !== 401;

  const retryPermissions = useCallback(() => {
    void refetchPermissions();
  }, [refetchPermissions]);
  const permissions = useMemo(
    () => effective?.permissions ?? [],
    [effective?.permissions],
  );

  // The server's answer wins over the token claim once it arrives; before that
  // the JWT role keeps the shell from flashing a redirect.
  const role = effective?.role ?? tokenRole;
  const isStaff =
    accessToken !== null && role !== null && STAFF_ROLES.has(role);

  // Both come from the SERVER flag, with no role-based fallback (TASK-475).
  // There used to be one — `role === "ADMIN"` — and it was wrong in the only
  // case the access model added: a deputy admin is an ADMIN who does not own the
  // shop, and the fallback would have shown them the owner's reserve until the
  // permissions request resolved. Undefined until then means "not the owner
  // yet", which hides a control for a moment instead of offering a 403.
  const isOwner = effective?.isOwner ?? false;
  const isAdmin = effective?.isAdmin ?? false;

  const can = useCallback(
    // `isAdmin`, not `isOwner`: an admin holds every permission. The server says
    // so too (it returns the full catalogue), so this is belt and braces for the
    // window before the answer arrives — and it is the line that would silently
    // strip a deputy's whole panel if it still read `isOwner`.
    (permission: string) => isAdmin || permissions.includes(permission),
    [isAdmin, permissions],
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
      isAdmin,
      isInitializing,
      permissions,
      arePermissionsLoading: accessToken !== null && permissionsPending,
      permissionsFailed,
      isRetryingPermissions: permissionsFailed && permissionsFetching,
      retryPermissions,
      isSessionExpired,
      expiredSessionEmail,
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
      isAdmin,
      isInitializing,
      permissions,
      permissionsPending,
      permissionsFailed,
      permissionsFetching,
      retryPermissions,
      isSessionExpired,
      expiredSessionEmail,
      can,
      canAll,
      setTokens,
      clearTokens,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
