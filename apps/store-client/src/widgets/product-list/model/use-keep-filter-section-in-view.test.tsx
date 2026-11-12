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
const scrollBy = jest.fn();
const originalScrollIntoView = Element.prototype.scrollIntoView;
const originalScrollBy = window.scrollBy;
const originalMatchMedia = window.matchMedia;
const originalInnerHeight = window.innerHeight;
const VIEWPORT_HEIGHT = 768;

beforeEach(() => {
  scrollIntoView.mockClear();
  scrollBy.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
  window.scrollBy = scrollBy as typeof window.scrollBy;
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: VIEWPORT_HEIGHT,
  });
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  window.scrollBy = originalScrollBy;
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: originalInnerHeight,
  });
});

/** Pin an element's rect: its top relative to the viewport, its height. */
function place(element: HTMLElement, top: number, height: number) {
  element.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      left: 0,
      right: 268,
      height,
      width: 268,
    }) as DOMRect;
  return element;
}

/** Where the brand section sits; 200px tall unless said otherwise. */
function placeSection(top: number, height = 200) {
  return place(screen.getByTestId("brand-section"), top, height);
}

/** Where the clicked «Apple» control sits. */
function placeControl(top: number) {
  return place(screen.getByRole("button", { name: "Apple" }), top, 40);
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
    placeControl(300);

    press("Apple");
    rerender(<Harness commitKey="brand=apple" />);
    await nextFrame();

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("brings THAT section back smoothly when the new results moved it off screen", async () => {
    reducedMotion(false);
    const { rerender } = render(<Harness commitKey="a" />);
    const section = placeSection(240);
    placeControl(300);

    press("Apple");
    // The results shortened the page: the browser clamped the scroll.
    placeSection(-320);
    placeControl(-260);
    rerender(<Harness commitKey="brand=apple" />);
    await nextFrame();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(section);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("treats a top pushed under the sticky header (scroll-margin-top) as gone", async () => {
    const { rerender } = render(<Harness commitKey="a" />);
    const section = placeSection(120);
    section.style.scrollMarginTop = "96px";
    placeControl(180);

    press("Apple");
    placeSection(40);
    placeControl(100);
    rerender(<Harness commitKey="brand=apple" />);
    await nextFrame();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("stays put when the shopper had scrolled the top under the header and nothing moved", async () => {
    // A tall section («Характеристики», a long brand list): the shopper
    // scrolled down to «Колір», so its top is already above the header line.
    const { rerender } = render(<Harness commitKey="a" />);
    const section = placeSection(-200, 1400);
    section.style.scrollMarginTop = "96px";
    placeControl(300);

    press("Apple");
    rerender(<Harness commitKey="brand=apple" />);
    await nextFrame();

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("brings the section back when the clicked control left the screen, even if its top was already gone", async () => {
    const { rerender } = render(<Harness commitKey="a" />);
    const section = placeSection(-200, 1400);
    section.style.scrollMarginTop = "96px";
    placeControl(300);

    press("Apple");
    // The rail reflowed: the ticked control slid below the fold.
    placeSection(360, 1400);
    placeControl(860);
    rerender(<Harness commitKey="brand=apple" />);
    await nextFrame();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(section);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("scrolls only the lost control back when the section start would push it off screen", async () => {
    reducedMotion(false);
    const { rerender } = render(<Harness commitKey="a" />);
    const section = placeSection(-600, 2000);
    section.style.scrollMarginTop = "96px";
    placeControl(300);

    press("Apple");
    // The page got shorter: the control went up under the header, 900px
    // deep in a section too tall to show from its start.
    placeSection(-1200, 2000);
    placeControl(-300);
    rerender(<Harness commitKey="brand=apple" />);
    await nextFrame();

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollBy).toHaveBeenCalledWith({ top: -396, behavior: "smooth" });
  });

  it("jumps instead of animating under prefers-reduced-motion", async () => {
    reducedMotion(true);
    const { rerender } = render(<Harness commitKey="a" />);
    placeSection(240);
    placeControl(300);

    press("Apple");
    placeSection(-320);
    placeControl(-260);
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
    placeSection(240);
    placeControl(300);

    press("Apple");
    placeSection(-320);
    placeControl(-260);
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
