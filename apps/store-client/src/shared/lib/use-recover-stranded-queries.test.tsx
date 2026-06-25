import { act, renderHook } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRecoverStrandedQueries } from "./use-recover-stranded-queries";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

/** Seed a query that never settles — the bfcache "stranded" state (TASK-120). */
function seedPendingQuery(client: QueryClient, key: QueryKey) {
  void client.prefetchQuery({
    queryKey: key,
    queryFn: () => new Promise<never>(() => {}),
  });
}

function fireVisible() {
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("useRecoverStrandedQueries", () => {
  it("cancels and refetches active queries when a pending query is stranded on restore", () => {
    const client = makeClient();
    seedPendingQuery(client, ["products"]);
    const cancelSpy = jest.spyOn(client, "cancelQueries").mockResolvedValue();
    const refetchSpy = jest
      .spyOn(client, "refetchQueries")
      .mockResolvedValue(undefined);

    renderHook(() => useRecoverStrandedQueries(), {
      wrapper: wrapperFor(client),
    });

    fireVisible();

    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(refetchSpy).toHaveBeenCalledTimes(1);
    expect(refetchSpy).toHaveBeenCalledWith({ type: "active" });
  });

  it("is a no-op when no query is pending (normal tab switch)", () => {
    const client = makeClient();
    client.setQueryData(["products"], { ok: true }); // resolved → not stranded
    const cancelSpy = jest.spyOn(client, "cancelQueries").mockResolvedValue();
    const refetchSpy = jest
      .spyOn(client, "refetchQueries")
      .mockResolvedValue(undefined);

    renderHook(() => useRecoverStrandedQueries(), {
      wrapper: wrapperFor(client),
    });

    fireVisible();

    expect(cancelSpy).not.toHaveBeenCalled();
    expect(refetchSpy).not.toHaveBeenCalled();
  });

  it("removes the visibilitychange listener on unmount", () => {
    const client = makeClient();
    seedPendingQuery(client, ["products"]);
    const cancelSpy = jest.spyOn(client, "cancelQueries").mockResolvedValue();

    const { unmount } = renderHook(() => useRecoverStrandedQueries(), {
      wrapper: wrapperFor(client),
    });

    unmount();
    fireVisible();

    expect(cancelSpy).not.toHaveBeenCalled();
  });
});
