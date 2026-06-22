import { type ReactElement, type ReactNode } from "react";
import {
  render,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AuthContext,
  type AuthContextValue,
} from "@/entities/session/model/auth.context";

/**
 * Build a fresh QueryClient per render with retries disabled — tests must fail
 * fast on the first error response rather than silently retrying.
 */
function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** A guest (unauthenticated, initialized) session — the default for tests. */
const guestAuth: AuthContextValue = {
  accessToken: null,
  userId: null,
  role: null,
  isAuthenticated: false,
  isInitializing: false,
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
};

export interface RenderWithProvidersOptions extends Omit<
  RenderOptions,
  "wrapper"
> {
  /** Override the auth context value (e.g. an authenticated user). */
  auth?: Partial<AuthContextValue>;
  /** Provide a shared QueryClient (e.g. to seed/inspect the cache). */
  queryClient?: QueryClient;
}

/**
 * Render a component inside the providers it depends on (React Query +
 * AuthContext). Unlike the real `AuthProvider`, the auth context here is a plain
 * value with no mount-time `/api/auth/refresh` call, so tests stay deterministic.
 */
export function renderWithProviders(
  ui: ReactElement,
  { auth, queryClient, ...options }: RenderWithProvidersOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const client = queryClient ?? makeTestQueryClient();
  const authValue: AuthContextValue = { ...guestAuth, ...auth };

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={authValue}>
          {children}
        </AuthContext.Provider>
      </QueryClientProvider>
    );
  }

  return {
    queryClient: client,
    ...render(ui, { wrapper: Wrapper, ...options }),
  };
}

// Re-export the full RTL API so test files import from one place.
export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
