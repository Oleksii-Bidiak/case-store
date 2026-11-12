import { act, fireEvent, render, screen } from "@/shared/test/render";
import { useKeepFilterSectionInView } from "./use-keep-filter-section-in-view";

/**
 * A rail with one filter section (brand) and one control outside every
 * section. Each button writes «a filter change» the way the view does: the
 * change, then `arm()`. `sort` is a change from outside the rail: `disarm()`.
 */
function Harness({
  commitKey,
  settled = true,
}: {
  commitKey: string;
  settled?: boolean;
}) {
  const { attachRail, rememberSection, arm, disarm } =
    useKeepFilterSectionInView(commitKey, settled);
  return (
    <>
      <aside
        ref={attachRail}
        onPointerDownCapture={rememberSection}
        onKeyDownCapture={rememberSection}
      >
        <div data-filter-section="brand" data-testid="brand-section">
          <button type="button" onClick={arm}>
            Apple
          </button>
        </div>
        <button type="button" onClick={arm}>
          Outside a section
        </button>
      </aside>
      <button type="button" onClick={disarm}>
        Sort
      </button>
    </>
  );
}

const scrollIntoView = jest.fn();
const originalScrollIntoView = Element.prototype.scrollIntoView;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  window.matchMedia = originalMatchMedia;
});

/** Where the brand section's top sits relative to the viewport. */
function placeSection(top: number) {
  const section = screen.getByTestId("brand-section");
  section.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + 200,
      left: 0,
      right: 268,
      height: 200,
      width: 268,
    }) as DOMRect;
  return section;
}

/** Let the hook's requestAnimationFrame run. */
async function nextFrame() {
  await act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

/** Click a control the way a shopper does — pointerdown, then the click. */
function press(name: string) {
  const button = screen.getByRole("button", { name });
  fireEvent.pointerDown(button);
  fireEvent.click(button);
}

function reducedMotion(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") && matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

describe("useKeepFilterSectionInView (TASK-2414)", () => {
  it("leaves the scroll alone when the clicked section is still on screen", async () => {
    const { rerender } = render(<Harness commitKey="a" />);
    placeSection(240);

    press("Apple");
    rerender(<Harness commitKey="brand=apple" />);
    await nextFrame();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("brings THAT section back smoothly when its top left the viewport", async () => {
    reducedMotion(false);
    const { rerender } = render(<Harness commitKey="a" />);
    const section = placeSection(-320);

    press("Apple");
    rerender(<Harness commitKey="brand=apple" />);
    await nextFrame();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(section);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("treats a top under the sticky header (scroll-margin-top) as gone", async () => {
    const { rerender } = render(<Harness commitKey="a" />);
    const section = placeSection(40);
    section.style.scrollMarginTop = "96px";

    press("Apple");
    rerender(<Harness commitKey="brand=apple" />);
    await nextFrame();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("jumps instead of animating under prefers-reduced-motion", async () => {
    reducedMotion(true);
    const { rerender } = render(<Harness commitKey="a" />);
    placeSection(-320);

    press("Apple");
    rerender(<Harness commitKey="brand=apple" />);
    await nextFrame();

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "auto",
    });
  });

  it("does nothing when the click was outside every filter section", async () => {
    const { rerender } = render(<Harness commitKey="a" />);
    placeSection(-320);

    press("Outside a section");
    rerender(<Harness commitKey="inStock=true" />);
    await nextFrame();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("waits for the new results before it checks", async () => {
    const { rerender } = render(<Harness commitKey="a" />);
    placeSection(-320);

    press("Apple");
    rerender(<Harness commitKey="brand=apple" settled={false} />);
    await nextFrame();
    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender(<Harness commitKey="brand=apple" settled />);
    await nextFrame();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("keeps the position on a change from outside the rail (sort, view, chips)", async () => {
    const { rerender } = render(<Harness commitKey="a" />);
    placeSection(-320);

    // A section was clicked earlier, but the change that lands is the sort.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Apple" }));
    press("Sort");
    rerender(<Harness commitKey="sortBy=price" />);
    await nextFrame();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
