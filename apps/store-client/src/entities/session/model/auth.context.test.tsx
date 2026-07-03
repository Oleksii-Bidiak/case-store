import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "@/shared/test/msw-server";
import { getGetCartQueryKey } from "@/shared/api/generated/cart/cart";
import { AuthProvider } from "./auth.context";
import { useAuth } from "./use-auth";

function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** Surfaces `isInitializing` so tests can await the bootstrap settling. */
function InitProbe() {
  const { isInitializing } = useAuth();
  return <span data-testid="init">{isInitializing ? "init" : "ready"}</span>;
}

function renderProvider(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <InitProbe />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

/**
 * TASK-118-C: after a successful mount-time refresh (the session-restore /
 * page-reload path), AuthProvider must invalidate the cart query so the merged
 * authenticated cart is refetched. On a failed refresh (guest) it must not.
 */
describe("AuthProvider — cart invalidation after silent refresh (TASK-118-C)", () => {
  it("invalidates the cart query after a successful mount-time refresh", async () => {
    server.use(
      http.post("*/api/auth/refresh", () =>
        HttpResponse.json({ data: { accessToken: "header.payload.sig" } }),
      ),
    );
    const client = makeTestQueryClient();
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");

    renderProvider(client);

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: getGetCartQueryKey(),
      }),
    );
  });

  it("does not invalidate the cart query when the refresh fails (guest)", async () => {
    server.use(
      http.post("*/api/auth/refresh", () =>
        HttpResponse.json({ data: {} }, { status: 401 }),
      ),
    );
    const client = makeTestQueryClient();
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");

    renderProvider(client);

    // Wait for bootstrap to settle, then assert no invalidation happened.
    await waitFor(() =>
      expect(screen.getByTestId("init")).toHaveTextContent("ready"),
    );
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

/**
 * fix/196: a transient bootstrap failure (429 from the rate limiter, 5xx,
 * network blip) must not silently sign the user out — the provider retries
 * once. Only a 401 ("no session") is terminal.
 */
describe("AuthProvider — transient bootstrap refresh failures (fix/196)", () => {
  it("retries once after a 429 and restores the session", async () => {
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
        return HttpResponse.json({
          data: { accessToken: "header.payload.sig" },
        });
      }),
    );
    const client = makeTestQueryClient();
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");

    renderProvider(client);

    // The retry waits ~2s before the second attempt — allow for it.
    await waitFor(
      () => expect(screen.getByTestId("init")).toHaveTextContent("ready"),
      { timeout: 5000 },
    );
    expect(calls).toBe(2);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: getGetCartQueryKey(),
    });
  }, 10000);

  it("does not retry on 401 — a missing session is terminal", async () => {
    let calls = 0;
    server.use(
      http.post("*/api/auth/refresh", () => {
        calls += 1;
        return HttpResponse.json({ data: {} }, { status: 401 });
      }),
    );
    const client = makeTestQueryClient();

    renderProvider(client);

    await waitFor(() =>
      expect(screen.getByTestId("init")).toHaveTextContent("ready"),
    );
    expect(calls).toBe(1);
  });
});
