import { act, renderHook } from "@testing-library/react";
import { useDebouncedCallback } from "./use-debounced-callback";

describe("useDebouncedCallback", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("fires the callback only after the delay elapses", () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 300));

    act(() => result.current("a"));
    expect(fn).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(299));
    expect(fn).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a");
  });

  it("collapses rapid calls — only the last one fires", () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 300));

    act(() => {
      result.current(1);
      result.current(2);
      result.current(3);
    });
    act(() => jest.advanceTimersByTime(300));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it("resets the delay on every call", () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 300));

    act(() => result.current());
    act(() => jest.advanceTimersByTime(200));
    act(() => result.current()); // restarts the 300 ms window
    act(() => jest.advanceTimersByTime(200));
    expect(fn).not.toHaveBeenCalled(); // 400 ms total, but window restarted

    act(() => jest.advanceTimersByTime(100));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("invokes the latest callback closure, not a stale one", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { result, rerender } = renderHook(
      ({ cb }: { cb: jest.Mock }) => useDebouncedCallback(cb, 300),
      { initialProps: { cb: first } },
    );

    act(() => result.current());
    rerender({ cb: second });
    act(() => jest.advanceTimersByTime(300));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("keeps a stable identity across renders while the delay is unchanged", () => {
    const { result, rerender } = renderHook(
      ({ cb }: { cb: jest.Mock }) => useDebouncedCallback(cb, 300),
      { initialProps: { cb: jest.fn() } },
    );

    const first = result.current;
    rerender({ cb: jest.fn() });
    expect(result.current).toBe(first);
  });

  /**
   * `cancel()` is the whole point of the TASK-423 review fix: the admin
   * `TableSearch` clears its box on Escape while the keystrokes before it are
   * still in flight, and an uncancellable debounce fired ~300 ms later with the
   * term the operator had just cancelled.
   */
  describe("cancel()", () => {
    it("drops a pending call so it never fires", () => {
      const fn = jest.fn();
      const { result } = renderHook(() => useDebouncedCallback(fn, 300));

      act(() => result.current("abandoned"));
      act(() => result.current.cancel());
      act(() => jest.advanceTimersByTime(300));

      expect(fn).not.toHaveBeenCalled();
    });

    it("is a no-op when nothing is pending, and leaves the handle usable", () => {
      const fn = jest.fn();
      const { result } = renderHook(() => useDebouncedCallback(fn, 300));

      // Callers must be able to cancel unconditionally — asking "is something
      // scheduled?" first would need state this hook does not expose.
      act(() => result.current.cancel());
      act(() => result.current.cancel());

      act(() => result.current("after"));
      act(() => jest.advanceTimersByTime(300));
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("after");
    });

    it("cancels only what is pending — a later call still fires in full", () => {
      const fn = jest.fn();
      const { result } = renderHook(() => useDebouncedCallback(fn, 300));

      act(() => result.current("first"));
      act(() => jest.advanceTimersByTime(200));
      act(() => result.current.cancel());
      act(() => result.current("second"));

      // The cancel must not have left a half-elapsed window behind: "second"
      // gets its own full 300 ms.
      act(() => jest.advanceTimersByTime(299));
      expect(fn).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(1));
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("second");
    });
  });

  it("does not fire after the component unmounts", () => {
    const fn = jest.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(fn, 300));

    act(() => result.current());
    unmount();
    act(() => jest.advanceTimersByTime(300));

    expect(fn).not.toHaveBeenCalled();
  });
});
