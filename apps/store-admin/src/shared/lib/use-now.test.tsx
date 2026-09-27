import { act, renderHook } from "@testing-library/react";
import { useNow } from "./use-now";

describe("useNow (TASK-629)", () => {
  const START = Date.parse("2026-09-26T10:00:00.000Z");

  beforeEach(() => jest.useFakeTimers({ now: START }));
  afterEach(() => jest.useRealTimers());

  it("is null until the first tick — the caller's fetch instant stands in", () => {
    const { result } = renderHook(() => useNow(60_000));
    expect(result.current).toBeNull();
  });

  it("re-renders with the clock on every tick, without any refetch", () => {
    const { result } = renderHook(() => useNow(60_000));

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(START + 60_000);

    act(() => {
      jest.advanceTimersByTime(2 * 60_000);
    });
    expect(result.current).toBe(START + 3 * 60_000);
  });

  it("stops ticking once unmounted", () => {
    const { unmount } = renderHook(() => useNow(60_000));
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
