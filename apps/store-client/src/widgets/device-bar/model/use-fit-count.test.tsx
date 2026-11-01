import { render } from "@testing-library/react";

import { useFitCount } from "./use-fit-count";

/** Records which nodes each ResizeObserver watches, and which are released. */
const observed = new Set<Element>();
class FakeResizeObserver {
  private readonly nodes = new Set<Element>();
  observe(node: Element) {
    this.nodes.add(node);
    observed.add(node);
  }
  unobserve(node: Element) {
    this.nodes.delete(node);
    observed.delete(node);
  }
  disconnect() {
    for (const node of this.nodes) observed.delete(node);
    this.nodes.clear();
  }
}

const originalResizeObserver = globalThis.ResizeObserver;
beforeAll(() => {
  globalThis.ResizeObserver =
    FakeResizeObserver as unknown as typeof ResizeObserver;
});
afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});
beforeEach(() => observed.clear());

function Row({ items, show }: { items: readonly string[]; show: boolean }) {
  const [ref, fit] = useFitCount<HTMLDivElement>(items);
  return (
    <>
      <output data-testid="fit">{fit ?? "none"}</output>
      {show ? (
        <div ref={ref} data-testid="row">
          {items.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : (
        // A different element, as in tier 2 (skeleton box vs links row):
        // React must mount a fresh row node when the links come back.
        <p data-testid="skeleton" />
      )}
    </>
  );
}

describe("useFitCount (TASK-2074)", () => {
  it("measures the row (jsdom lays everything out on one line)", () => {
    const { getByTestId } = render(<Row items={["a", "b", "c"]} show />);
    expect(getByTestId("fit")).toHaveTextContent("3");
    expect(observed.has(getByTestId("row"))).toBe(true);
  });

  it("follows a remounted row instead of staying on the detached one", () => {
    const items = ["a", "b"];
    const { getByTestId, queryByTestId, rerender } = render(
      <Row items={items} show />,
    );
    const first = getByTestId("row");

    // 1440 → 900: the links give way to the skeleton.
    rerender(<Row items={items} show={false} />);
    expect(queryByTestId("row")).not.toBeInTheDocument();
    expect(observed.size).toBe(0);

    // 900 → 1100: a new row node, and the observer is on it.
    rerender(<Row items={items} show />);
    const second = getByTestId("row");
    expect(second).not.toBe(first);
    expect(observed.has(second)).toBe(true);
    expect(observed.has(first)).toBe(false);
  });

  it("re-measures when the items change at the same count", () => {
    const { getByTestId, rerender } = render(<Row items={["a", "b"]} show />);
    const spy = jest.spyOn(HTMLElement.prototype, "offsetTop", "get");
    rerender(<Row items={["c", "d"]} show />);
    expect(spy).toHaveBeenCalled();
    expect(getByTestId("fit")).toHaveTextContent("2");
    spy.mockRestore();
  });
});
