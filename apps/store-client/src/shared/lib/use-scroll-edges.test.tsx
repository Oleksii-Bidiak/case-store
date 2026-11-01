import { act, fireEvent, render, screen } from "@testing-library/react";
import { useScrollEdges } from "./use-scroll-edges";

/**
 * TASK-2079 — rail arrows disable at the row's ends. jsdom has no layout, so
 * the scroller's geometry is stubbed per element; ResizeObserver is replaced
 * by a handle that lets a test fire "the scroller changed size".
 */

const observers: ResizeObserverCallback[] = [];
const OriginalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  observers.length = 0;
  globalThis.ResizeObserver = class {
    constructor(cb: ResizeObserverCallback) {
      observers.push(cb);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = OriginalResizeObserver;
});

function geometry(
  el: HTMLElement,
  { left, client, scroll }: { left: number; client: number; scroll: number },
) {
  Object.defineProperty(el, "scrollLeft", { value: left, configurable: true });
  Object.defineProperty(el, "clientWidth", {
    value: client,
    configurable: true,
  });
  Object.defineProperty(el, "scrollWidth", {
    value: scroll,
    configurable: true,
  });
}

// The initial geometry is stubbed once per element, before the hook measures.
const stubbed = new WeakSet<HTMLElement>();

function Rail({ onEl }: { onEl?: (el: HTMLElement) => void }) {
  const { setScroller, atStart, atEnd } = useScrollEdges();
  return (
    <>
      <div
        data-testid="scroller"
        ref={(el) => {
          if (el && onEl && !stubbed.has(el)) {
            stubbed.add(el);
            onEl(el);
          }
          setScroller(el);
        }}
      />
      <button type="button" disabled={atStart}>
        prev
      </button>
      <button type="button" disabled={atEnd}>
        next
      </button>
    </>
  );
}

describe("useScrollEdges (TASK-2079)", () => {
  it("disables back at the start and forward at the end", () => {
    render(
      <Rail
        onEl={(el) => geometry(el, { left: 0, client: 400, scroll: 1200 })}
      />,
    );
    expect(screen.getByRole("button", { name: "prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "next" })).toBeEnabled();

    const scroller = screen.getByTestId("scroller");
    geometry(scroller, { left: 400, client: 400, scroll: 1200 });
    fireEvent.scroll(scroller);
    expect(screen.getByRole("button", { name: "prev" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "next" })).toBeEnabled();

    geometry(scroller, { left: 800, client: 400, scroll: 1200 });
    fireEvent.scroll(scroller);
    expect(screen.getByRole("button", { name: "prev" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "next" })).toBeDisabled();
  });

  it("disables both arrows when the row fits on one screen", () => {
    render(
      <Rail
        onEl={(el) => geometry(el, { left: 0, client: 1200, scroll: 1200 })}
      />,
    );
    expect(screen.getByRole("button", { name: "prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "next" })).toBeDisabled();
  });

  it("re-measures when the scroller is resized", () => {
    render(
      <Rail
        onEl={(el) => geometry(el, { left: 0, client: 1200, scroll: 1200 })}
      />,
    );
    const scroller = screen.getByTestId("scroller");
    geometry(scroller, { left: 0, client: 400, scroll: 1200 });
    act(() => {
      observers.forEach((cb) => cb([], {} as ResizeObserver));
    });
    expect(screen.getByRole("button", { name: "next" })).toBeEnabled();
  });
});
