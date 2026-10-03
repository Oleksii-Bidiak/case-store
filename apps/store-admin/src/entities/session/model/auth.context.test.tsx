import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { api } from "@/shared/api";
import { AuthProvider } from "./auth.context";
import { useAuth } from "./use-auth";

/** Build an unsigned JWT-shaped token whose payload decodes to the given role. */
function makeToken(role: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: "admin-1", role }),
  ).toString("base64");
  return `header.${payload}.sig`;
}

/** Surfaces the session state so tests can await the bootstrap settling. */
function Probe() {
  const {
    isInitializing,
    isStaff,
    isOwner,
    isAdmin,
    email,
    role,
    permissions,
    can,
    permissionsFailed,
    retryPermissions,
    isSessionExpired,
    expiredSessionEmail,
  } = useAuth();
  return (
    <>
      <span data-testid="permissions-failed">
        {permissionsFailed ? "yes" : "no"}
      </span>
      <button type="button" onClick={retryPermissions}>
        retry-permissions
      </button>
      <span data-testid="expired">{isSessionExpired ? "yes" : "no"}</span>
      <span data-testid="expired-email">{expiredSessionEmail ?? "none"}</span>
      <span data-testid="probe">
        {isInitializing
          ? "init"
          : isStaff
            ? isOwner
              ? "owner"
              : "staff"
            : "guest"}
      </span>
      <span data-testid="is-admin">{isAdmin ? "yes" : "no"}</span>
      <span data-testid="email">{email ?? "no-email"}</span>
      <span data-testid="role">{role ?? "no-role"}</span>
      <span data-testid="permissions">
        {permissions.length > 0 ? [...permissions].sort().join(",") : "none"}
      </span>
      <span data-testid="can-orders">{can("orders:read") ? "yes" : "no"}</span>
      <span data-testid="can-blog">{can("blog:write") ? "yes" : "no"}</span>
    </>
  );
}

function renderProvider() {
  return renderWithProviders(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

/** Restore a session for `role` and answer /auth/me/permissions with `effective`. */
function stubSession(
  role: string,
  effective: {
    role: string;
    isOwner: boolean;
    isAdmin: boolean;
    permissions: string[];
  },
) {
  server.use(
    http.post("*/api/auth/refresh", () =>
      HttpResponse.json({ data: { accessToken: makeToken(role) } }),
    ),
    http.get("*/api/auth/me/permissions", () =>
      HttpResponse.json({ data: effective }),
    ),
  );
}

const SESSION_MARKER_KEY = "case-store-admin:session";

function expireAdminUiSessionCookie() {
  document.cookie = "admin_ui_session=; path=/; max-age=0";
}

// TASK-528: the bootstrap refresh only runs when this browser holds a session
// marker. Every suite below except the marker suite describes a browser that
// signed in before — so the marker is set by default, and the jsdom storage and
// cookie jar (which outlive a single test) are wiped after each one.
beforeEach(() => {
  window.localStorage.setItem(SESSION_MARKER_KEY, "1");
});

afterEach(() => {
  window.localStorage.clear();
  expireAdminUiSessionCookie();
});

/**
 * fix/196: a transient bootstrap failure (429 from the rate limiter, 5xx,
 * network blip) must not kick the admin to /login on a page reload — the
 * provider retries once. Only a 401 ("no session") is terminal.
 */
describe("AuthProvider — bootstrap refresh resilience (fix/196)", () => {
  it("retries once after a 429 and restores the admin session", async () => {
    let calls = 0;
    server.use(
      http.post("*/api/auth/refresh", () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            { message: "Too Many Requests" },
            { status: 429 },
          );
        }
        return HttpResponse.json({ data: { accessToken: makeToken("ADMIN") } });
      }),
    );

    renderProvider();

    // The retry waits ~2s before the second attempt — allow for it.
    await waitFor(
      () => expect(screen.getByTestId("probe")).toHaveTextContent("owner"),
      { timeout: 5000 },
    );
    expect(calls).toBe(2);
  }, 10000);

  it("does not retry on 401 — a missing session is terminal", async () => {
    let calls = 0;
    server.use(
      http.post("*/api/auth/refresh", () => {
        calls += 1;
        return HttpResponse.json({ data: {} }, { status: 401 });
      }),
    );

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("guest"),
    );
    expect(calls).toBe(1);
  });
});

/** Exposes `clearTokens` so a test can sign out the way the logout button does. */
function SignOutProbe() {
  const { clearTokens } = useAuth();
  return (
    <button type="button" onClick={clearTokens}>
      sign-out
    </button>
  );
}

/**
 * TASK-528 — the storefront's session marker (TASK-419), ported. A browser with
 * no session must not ask POST /api/auth/refresh on load: the answer is a 401
 * that the BROWSER logs to the console on every visit to /login, and no handler
 * in the app can suppress it. Only a 401 or a sign-out forgets the marker; a
 * transient bootstrap failure must not.
 */
describe("AuthProvider — session marker (TASK-528)", () => {
  it("does not call refresh at all when this browser holds no session", async () => {
    window.localStorage.clear();
    let calls = 0;
    server.use(
      http.post("*/api/auth/refresh", () => {
        calls += 1;
        return HttpResponse.json({ data: {} }, { status: 401 });
      }),
    );

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("guest"),
    );
    expect(calls).toBe(0);
  });

  it("still restores a session signed in before the marker existed (admin_ui_session cookie)", async () => {
    // An operator signed in before TASK-528 shipped: live refresh cookie and
    // the proxy's marker cookie, but no localStorage marker. The first load
    // after the deploy must not send them back to /login.
    window.localStorage.clear();
    document.cookie = "admin_ui_session=1; path=/";
    stubSession("ADMIN", {
      role: "ADMIN",
      isOwner: true,
      isAdmin: true,
      permissions: [],
    });

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("owner"),
    );
    // …and from then on the two markers agree.
    expect(window.localStorage.getItem(SESSION_MARKER_KEY)).toBe("1");
  });

  it("forgets the marker when refresh answers 401", async () => {
    server.use(
      http.post("*/api/auth/refresh", () =>
        HttpResponse.json({ data: {} }, { status: 401 }),
      ),
    );

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("guest"),
    );
    expect(window.localStorage.getItem(SESSION_MARKER_KEY)).toBeNull();
  });

  it("keeps the marker when the bootstrap gives up on a 5xx — the next load tries again", async () => {
    let calls = 0;
    server.use(
      http.post("*/api/auth/refresh", () => {
        calls += 1;
        return HttpResponse.json({ message: "boom" }, { status: 503 });
      }),
    );

    renderProvider();

    // One retry after ~2s, then the provider settles signed out for this load.
    await waitFor(
      () => expect(screen.getByTestId("probe")).toHaveTextContent("guest"),
      { timeout: 5000 },
    );
    expect(calls).toBe(2);
    expect(window.localStorage.getItem(SESSION_MARKER_KEY)).toBe("1");
  }, 10000);

  it("forgets the marker on sign-out", async () => {
    stubSession("ADMIN", {
      role: "ADMIN",
      isOwner: true,
      isAdmin: true,
      permissions: [],
    });

    renderWithProviders(
      <AuthProvider>
        <Probe />
        <SignOutProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("owner"),
    );
    expect(window.localStorage.getItem(SESSION_MARKER_KEY)).toBe("1");

    await userEvent.click(screen.getByRole("button", { name: "sign-out" }));

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("guest"),
    );
    expect(window.localStorage.getItem(SESSION_MARKER_KEY)).toBeNull();
    expect(document.cookie).not.toContain("admin_ui_session=1");
  });

  it("forgets the marker when the restored session is not staff", async () => {
    server.use(
      http.post("*/api/auth/refresh", () =>
        HttpResponse.json({ data: { accessToken: makeToken("CUSTOMER") } }),
      ),
    );

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("guest"),
    );
    // A shopper's refresh cookie is no reason to keep asking on every load.
    expect(window.localStorage.getItem(SESSION_MARKER_KEY)).toBeNull();
  });
});

/**
 * TASK-334 — the change that unblocks everything else.
 *
 * The provider used to clear any token whose role was not exactly ADMIN, so a
 * MANAGER could be created, granted permissions, and still never get past
 * /login. These tests pin the new rule: staff roles are admitted, shoppers are
 * not, and what a staff member may DO comes from the server, not the token.
 */
describe("AuthProvider — staff sessions (TASK-334)", () => {
  it("admits a MANAGER and exposes the permissions the server granted", async () => {
    stubSession("MANAGER", {
      role: "MANAGER",
      isOwner: false,
      isAdmin: false,
      permissions: ["blog:write", "pages:write"],
    });

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("staff"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("permissions")).toHaveTextContent(
        "blog:write,pages:write",
      ),
    );
    expect(screen.getByTestId("role")).toHaveTextContent("MANAGER");
    // Granted → yes; not granted → no. A manager is NOT an owner, so `can()`
    // must not short-circuit to true.
    expect(screen.getByTestId("can-blog")).toHaveTextContent("yes");
    expect(screen.getByTestId("can-orders")).toHaveTextContent("no");
  });

  it("still refuses a CUSTOMER token — the admin app is staff-only", async () => {
    server.use(
      http.post("*/api/auth/refresh", () =>
        HttpResponse.json({ data: { accessToken: makeToken("CUSTOMER") } }),
      ),
    );

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("guest"),
    );
  });

  it("treats the owner as holding every permission without listing any", async () => {
    stubSession("ADMIN", {
      role: "ADMIN",
      isOwner: true,
      isAdmin: true,
      permissions: [],
    });

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("owner"),
    );
    expect(screen.getByTestId("permissions")).toHaveTextContent("none");
    expect(screen.getByTestId("can-orders")).toHaveTextContent("yes");
    expect(screen.getByTestId("can-blog")).toHaveTextContent("yes");
  });

  it("treats a DEPUTY admin as holding everything WITHOUT calling them the owner", async () => {
    // The case the access model introduced (TASK-475). The provider used to fall
    // back to `role === "ADMIN"` for `isOwner`, which said this session owned the
    // shop — and would have offered it the owner's reserve: ownership transfer,
    // appointing admins, acting on another admin's account. Every one of those
    // buttons can only answer 403.
    stubSession("ADMIN", {
      role: "ADMIN",
      isOwner: false,
      isAdmin: true,
      permissions: [],
    });

    renderProvider();

    // Awaited on `is-admin`, not on `probe`: `isStaff` is true from the token
    // alone, so the probe reads "staff" before the permissions answer lands and
    // a bare assertion here would race it.
    await waitFor(() =>
      expect(screen.getByTestId("is-admin")).toHaveTextContent("yes"),
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("staff");
    expect(screen.getByTestId("probe")).not.toHaveTextContent("owner");
    // …and they still see every operational control, which is the whole point of
    // a deputy: the shop runs while the owner is away.
    expect(screen.getByTestId("can-orders")).toHaveTextContent("yes");
    expect(screen.getByTestId("can-blog")).toHaveTextContent("yes");
  });

  it("never infers ownership from the token's role while the server answer is missing", async () => {
    // The fallback's other half: a valid ADMIN token whose `/me/permissions`
    // call fails. Answering "owner" from the token alone is what the fallback
    // did; the honest answer is "not yet", so no reserve is rendered.
    let permissionCalls = 0;
    server.use(
      http.post("*/api/auth/refresh", () =>
        HttpResponse.json({ data: { accessToken: makeToken("ADMIN") } }),
      ),
      http.get("*/api/auth/me/permissions", () => {
        permissionCalls += 1;
        return HttpResponse.json({ message: "boom" }, { status: 500 });
      }),
    );

    renderProvider();

    // Waited on the REQUEST, not on the render: asserting "not the owner" before
    // the fetch has even been attempted would pass against any implementation.
    await waitFor(() => expect(permissionCalls).toBeGreaterThan(0));
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("staff"),
    );
    expect(screen.getByTestId("probe")).not.toHaveTextContent("owner");
    expect(screen.getByTestId("is-admin")).toHaveTextContent("no");
  });

  it("degrades to no permissions when the permissions fetch fails", async () => {
    server.use(
      http.post("*/api/auth/refresh", () =>
        HttpResponse.json({ data: { accessToken: makeToken("MANAGER") } }),
      ),
      http.get("*/api/auth/me/permissions", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    renderProvider();

    // The session survives — the panel is simply empty, which is the safe
    // direction: no links that would 403 anyway.
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("staff"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("can-blog")).toHaveTextContent("no"),
    );
  });

  it("does not ask for permissions while signed out", async () => {
    let permissionCalls = 0;
    server.use(
      http.get("*/api/auth/me/permissions", () => {
        permissionCalls += 1;
        return HttpResponse.json({ message: "unauthorized" }, { status: 401 });
      }),
    );

    renderProvider();

    // Default refresh handler 401s → signed out.
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("guest"),
    );
    expect(permissionCalls).toBe(0);
  });
});

/**
 * TASK-255: whenever an access token appears (bootstrap restore, login,
 * refresh rotation), the provider fetches /api/users/me and exposes the
 * admin's email for the header. The fetch is purely informational — a failure
 * leaves email null and never affects the session state.
 */
describe("AuthProvider — header identity profile fetch (TASK-255)", () => {
  it("populates email from /api/users/me after a successful bootstrap restore", async () => {
    server.use(
      http.post("*/api/auth/refresh", () =>
        HttpResponse.json({ data: { accessToken: makeToken("ADMIN") } }),
      ),
      // The shared default handler already answers /api/users/me with
      // admin@example.com — assert against that.
    );

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("owner"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("email")).toHaveTextContent(
        "admin@example.com",
      ),
    );
  });

  it("leaves email null on a failing profile fetch without touching session state", async () => {
    server.use(
      http.post("*/api/auth/refresh", () =>
        HttpResponse.json({ data: { accessToken: makeToken("ADMIN") } }),
      ),
      http.get("*/api/users/me", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    renderProvider();

    // Session restores fine despite the profile fetch failing…
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("owner"),
    );
    // …and email simply stays null.
    await waitFor(() =>
      expect(screen.getByTestId("email")).toHaveTextContent("no-email"),
    );
  });

  it("keeps email null while signed out (no profile fetch without a token)", async () => {
    let profileCalls = 0;
    server.use(
      http.get("*/api/users/me", () => {
        profileCalls += 1;
        return HttpResponse.json({ message: "unauthorized" }, { status: 401 });
      }),
    );

    renderProvider();

    // Default refresh handler 401s → signed out.
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("guest"),
    );
    expect(screen.getByTestId("email")).toHaveTextContent("no-email");
    expect(profileCalls).toBe(0);
  });
});

/**
 * Wave 198 (TASK-1014): a failed permissions fetch is a STATE the shell can
 * explain, not a silently empty panel.
 */
describe("AuthProvider — permissions failure state (TASK-1014)", () => {
  it("reports the failure and clears it once «Повторити» succeeds", async () => {
    let fail = true;
    server.use(
      http.post("*/api/auth/refresh", () =>
        HttpResponse.json({ data: { accessToken: makeToken("ADMIN") } }),
      ),
      http.get("*/api/auth/me/permissions", () =>
        fail
          ? HttpResponse.json({ message: "boom" }, { status: 500 })
          : HttpResponse.json({
              data: {
                role: "ADMIN",
                isOwner: true,
                isAdmin: true,
                permissions: [],
                entries: [],
              },
            }),
      ),
    );
    const user = userEvent.setup();

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("permissions-failed")).toHaveTextContent("yes"),
    );
    // The owner too: nothing tells the panel they own the shop.
    expect(screen.getByTestId("can-orders")).toHaveTextContent("no");

    fail = false;
    await user.click(screen.getByRole("button", { name: "retry-permissions" }));

    await waitFor(() =>
      expect(screen.getByTestId("permissions-failed")).toHaveTextContent("no"),
    );
    expect(screen.getByTestId("can-orders")).toHaveTextContent("yes");
  });

  it("does not call a 401 a failure — that is the session ending", async () => {
    server.use(
      http.post("*/api/auth/refresh", () =>
        HttpResponse.json({ data: { accessToken: makeToken("ADMIN") } }),
      ),
      http.get("*/api/auth/me/permissions", () =>
        HttpResponse.json({ message: "unauthorized" }, { status: 401 }),
      ),
    );

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("staff"),
    );
    // Give the permissions request time to settle.
    await waitFor(() =>
      expect(screen.getByTestId("can-orders")).toHaveTextContent("no"),
    );
    expect(screen.getByTestId("permissions-failed")).toHaveTextContent("no");
  });
});

/**
 * Wave 198 (TASK-528 + TASK-974): a session that ends WHILE the person works is
 * reported, with the email it belonged to, instead of failing in place.
 */
describe("AuthProvider — session expiry (TASK-528 + TASK-974)", () => {
  it("flags the expiry when a request 401s and so does its refresh", async () => {
    let refreshCalls = 0;
    server.use(
      http.post("*/api/auth/refresh", () => {
        refreshCalls += 1;
        return refreshCalls === 1
          ? HttpResponse.json({ data: { accessToken: makeToken("ADMIN") } })
          : HttpResponse.json({ message: "expired" }, { status: 401 });
      }),
      http.get("*/api/admin/orders", () =>
        HttpResponse.json({ message: "unauthorized" }, { status: 401 }),
      ),
    );

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("email")).toHaveTextContent(
        "admin@example.com",
      ),
    );
    expect(screen.getByTestId("expired")).toHaveTextContent("no");

    await expect(api.get("/api/admin/orders")).rejects.toBeTruthy();

    await waitFor(() =>
      expect(screen.getByTestId("expired")).toHaveTextContent("yes"),
    );
    expect(screen.getByTestId("expired-email")).toHaveTextContent(
      "admin@example.com",
    );
  });

  it("does not call a failed bootstrap an expiry — that browser was never signed in", async () => {
    renderProvider();

    // Default refresh handler 401s → signed out.
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("guest"),
    );
    expect(screen.getByTestId("expired")).toHaveTextContent("no");
  });
});
