import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
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
  const { isInitializing, isAdmin } = useAuth();
  return (
    <span data-testid="probe">
      {isInitializing ? "init" : isAdmin ? "admin" : "guest"}
    </span>
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

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    // The retry waits ~2s before the second attempt — allow for it.
    await waitFor(
      () => expect(screen.getByTestId("probe")).toHaveTextContent("admin"),
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

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("guest"),
    );
    expect(calls).toBe(1);
  });
});
