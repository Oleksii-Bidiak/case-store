import { useRef } from "react";
import { act, render } from "@testing-library/react";
import {
  MOBILE_BAR_INSET_VAR,
  useMobileBarInset,
} from "./use-mobile-bar-inset";

/**
 * TASK-1771 — a fixed bottom bar publishes its measured height on <html> while
 * it is mounted, and globals.css lifts the toaster by it below `md`. jsdom has
 * no layout, so the height is stubbed per element and ResizeObserver is replaced
 * by a handle that lets a test fire the "the bar changed size" callback.
 */

const observers: Array<{ cb: ResizeObserverCallback; disconnected: boolean }> =
  [];
const OriginalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  observers.length = 0;
  globalThis.ResizeObserver = class {
    private entry: { cb: ResizeObserverCallback; disconnected: boolean };
    constructor(cb: ResizeObserverCallback) {
      this.entry = { cb, disconnected: false };
      observers.push(this.entry);
    }
    observe() {}
    unobserve() {}
    disconnect() {
      this.entry.disconnected = true;
    }
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = OriginalResizeObserver;
  document.documentElement.style.removeProperty(MOBILE_BAR_INSET_VAR);
});

const heights = new Map<string, number>();

function Bar({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useMobileBarInset(ref);
  return (
    <div
      data-testid={id}
      ref={(node) => {
        ref.current = node;
        if (node) {
          node.getBoundingClientRect = () =>
            ({ height: heights.get(id) ?? 0 }) as DOMRect;
        }
      }}
    />
  );
}

const published = () =>
  document.documentElement.style.getPropertyValue(MOBILE_BAR_INSET_VAR);

describe("useMobileBarInset (TASK-1771)", () => {
  it("publishes the bar's measured height, rounded up, while it is mounted", () => {
    heights.set("cart", 68.4);
    const { unmount } = render(<Bar id="cart" />);

    expect(published()).toBe("69px");

    unmount();
    // Gone with the bar — no lift is left behind on a page without one.
    expect(published()).toBe("");
  });

  it("follows the bar when it changes size", () => {
    heights.set("cart", 68);
    render(<Bar id="cart" />);
    expect(published()).toBe("68px");

    // A long amount wraps, a larger system font… — and from md up the bar
    // dissolves into the summary card and measures 0.
    heights.set("cart", 0);
    act(() => {
      observers[0].cb([], {} as ResizeObserver);
    });
    expect(published()).toBe("0px");
  });

  it("keeps the inset while ANOTHER bar is still mounted", () => {
    heights.set("blocked", 68);
    heights.set("ready", 72);
    const { rerender } = render(
      <>
        <Bar key="blocked" id="blocked" />
        <Bar key="ready" id="ready" />
      </>,
    );
    // Two live bars — the toast must clear the taller one.
    expect(published()).toBe("72px");

    // The cart summary swaps its blocked bar for the enabled one in one commit:
    // the old bar's cleanup must not wipe the new bar's inset.
    rerender(<Bar key="ready" id="ready" />);
    expect(published()).toBe("72px");
  });

  it("stops observing once the bar unmounts", () => {
    heights.set("cart", 68);
    const { unmount } = render(<Bar id="cart" />);
    unmount();
    expect(observers[0].disconnected).toBe(true);
  });
});
