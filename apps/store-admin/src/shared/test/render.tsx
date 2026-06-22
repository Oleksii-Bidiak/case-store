import { type ReactElement, type ReactNode } from "react";
import {
  render,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
}

/** Render a component wrapped in the admin app providers (React Query). */
export function renderWithProviders(
  ui: ReactElement,
  { queryClient, ...options }: RenderWithProvidersOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const client = queryClient ?? makeTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  return {
    queryClient: client,
    ...render(ui, { wrapper: Wrapper, ...options }),
  };
}

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
