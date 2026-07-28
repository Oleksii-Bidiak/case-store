import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
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
  const { isInitializing, isStaff, isOwner, email, role, permissions, can } =
    useAuth();
  return (
    <>
      <span data-testid="probe">
        {isInitializing
          ? "init"
          : isStaff
            ? isOwner
              ? "owner"
              : "staff"
            : "guest"}
      </span>
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
  effective: { role: string; isOwner: boolean; permissions: string[] },
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
    stubSession("ADMIN", { role: "ADMIN", isOwner: true, permissions: [] });

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("owner"),
    );
    expect(screen.getByTestId("permissions")).toHaveTextContent("none");
    expect(screen.getByTestId("can-orders")).toHaveTextContent("yes");
    expect(screen.getByTestId("can-blog")).toHaveTextContent("yes");
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
