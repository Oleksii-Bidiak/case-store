import { type ReactElement, type ReactNode } from "react";
import {
  render,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Upward import, allowed only here: `shared/test/**` is exempt from the FSD
// boundary rule (see `eslint.config.mjs`), because test infrastructure is
// cross-cutting by nature — it wires the same providers the app does.
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import type { AuthContextValue } from "@/entities/session/model/auth.context";

/** Fresh QueryClient per render with retries off — tests fail fast on errors. */
function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface RenderWithProvidersOptions extends Omit<
  RenderOptions,
  "wrapper"
> {
  /** Provide a shared QueryClient (e.g. to seed/inspect the cache). */
  queryClient?: QueryClient;
  /**
   * Session context for this render. Defaults to a signed-in manager holding
   * NO permissions — see the note on the wrapper below.
   */
  auth?: Partial<AuthContextValue>;
}

/**
 * Render a component wrapped in the admin app providers (React Query + session).
 *
 * WHY THE SESSION PROVIDER IS HERE AND WHY IT GRANTS NOTHING BY DEFAULT.
 * `useAuth()` throws without a provider, which used to be fine: only components
 * that obviously needed permissions read it, and their tests wrapped themselves
 * in `WithAuth`. TASK-441 changed that — the media picker is now mounted inside
 * ordinary content forms, so a form test that never mentioned permissions began
 * crashing on a hook three layers down.
 *
 * The default therefore reproduces what those tests already had in effect:
 * signed in, and permitted nothing. Every permission-gated control stays absent
 * unless a test asks for it, so no existing assertion changes meaning, and a
 * test that wants the picker says so — with `auth`, or by wrapping in `WithAuth`
 * itself (an inner provider wins).
 */
export function renderWithProviders(
  ui: ReactElement,
  { queryClient, auth, ...options }: RenderWithProvidersOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const client = queryClient ?? makeTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <WithAuth {...auth}>{children}</WithAuth>
      </QueryClientProvider>
    );
  }

  return {
    queryClient: client,
    ...render(ui, { wrapper: Wrapper, ...options }),
  };
}

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
