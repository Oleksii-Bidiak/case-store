import { act, renderHook } from "@testing-library/react";
import { NOW_TICK_MS, useNow } from "./use-now";

const START = Date.parse("2026-10-04T12:00:00.000Z");

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(START);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useNow (TASK-217)", () => {
  it("re-reads the clock every tick while enabled", () => {
    const { result } = renderHook(() => useNow(true));
    expect(result.current).toBe(START);

    act(() => {
      jest.advanceTimersByTime(NOW_TICK_MS);
    });
    expect(result.current).toBe(START + NOW_TICK_MS);

    act(() => {
      jest.advanceTimersByTime(NOW_TICK_MS);
    });
    expect(result.current).toBe(START + 2 * NOW_TICK_MS);
  });

  it("runs no timer while disabled", () => {
    const { result } = renderHook(() => useNow(false));
    act(() => {
      jest.advanceTimersByTime(5 * NOW_TICK_MS);
    });
    expect(result.current).toBe(START);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("catches up as soon as it is enabled", () => {
    const { result, rerender } = renderHook(({ enabled }) => useNow(enabled), {
      initialProps: { enabled: false },
    });
    jest.setSystemTime(START + 90_000);

    rerender({ enabled: true });
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(result.current).toBe(START + 90_000);
  });

  it("stops its timers on unmount", () => {
    const { unmount } = renderHook(() => useNow(true));
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
