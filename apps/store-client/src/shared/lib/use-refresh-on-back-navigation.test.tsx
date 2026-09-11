import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, act } from "@testing-library/react";
import { useRefreshOnBackNavigation } from "./use-refresh-on-back-navigation";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => refresh() }),
}));

function Harness({ client }: { client: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>
  );
}

function Probe() {
  useRefreshOnBackNavigation();
  return null;
}

/**
 * TASK-409 / AD-PROD-16 — a product hidden by the admin stayed visible after the
 * shopper pressed Back, because React Query served a still-fresh cache entry.
 */
describe("useRefreshOnBackNavigation", () => {
  beforeEach(() => refresh.mockClear());

  it("marks cached queries stale and refreshes the RSC payload on popstate", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: false } },
    });
    client.setQueryData(["/api/products/hidden-one"], { data: { id: "p1" } });
    expect(
      client.getQueryState(["/api/products/hidden-one"])?.isInvalidated,
    ).toBe(false);

    render(<Harness client={client} />);
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(
      client.getQueryState(["/api/products/hidden-one"])?.isInvalidated,
    ).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("leaves the cache alone on an ordinary forward navigation", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: false } },
    });
    client.setQueryData(["/api/products/kept"], { data: { id: "p1" } });

    render(<Harness client={client} />);

    expect(client.getQueryState(["/api/products/kept"])?.isInvalidated).toBe(
      false,
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("detaches its listener on unmount", () => {
    const client = new QueryClient();
    const { unmount } = render(<Harness client={client} />);

    unmount();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(refresh).not.toHaveBeenCalled();
  });
});
