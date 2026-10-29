import { act, fireEvent, render, screen } from "@testing-library/react";
import { useHashNavigation } from "./use-hash-navigation";

const onHash = jest.fn();

/* eslint-disable @next/next/no-html-link-for-pages -- plain anchors stand in
   for Next's <Link>: the hook reads the click, not the router. */
function Probe() {
  useHashNavigation(onHash);
  return (
    <>
      <a href="/info#faq" onClick={(e) => e.preventDefault()}>
        same page
      </a>
      <a href="/contact#faq" onClick={(e) => e.preventDefault()}>
        other page
      </a>
      <a href="/info#about" target="_blank" onClick={(e) => e.preventDefault()}>
        new tab
      </a>
    </>
  );
}
/* eslint-enable @next/next/no-html-link-for-pages */

const flushFrame = () =>
  act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );

/** TASK-1992 / TASK-1670 — the hash listener behind /info deep links. */
describe("useHashNavigation", () => {
  beforeEach(() => {
    onHash.mockClear();
    window.history.replaceState(null, "", "/info#delivery");
  });
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("reports the hash once on mount, without the #", async () => {
    render(<Probe />);
    await flushFrame();

    expect(onHash).toHaveBeenCalledTimes(1);
    expect(onHash).toHaveBeenCalledWith("delivery", "mount");
  });

  it("reports a same-page link's hash on click, before any URL change", async () => {
    render(<Probe />);
    await flushFrame();
    onHash.mockClear();

    fireEvent.click(screen.getByText("same page"));

    expect(onHash).toHaveBeenCalledWith("faq", "change");
  });

  it("ignores links to another page, targeted links and modified clicks", async () => {
    render(<Probe />);
    await flushFrame();
    onHash.mockClear();

    fireEvent.click(screen.getByText("other page"));
    fireEvent.click(screen.getByText("new tab"));
    fireEvent.click(screen.getByText("same page"), { ctrlKey: true });
    fireEvent.click(screen.getByText("same page"), { button: 1 });

    expect(onHash).not.toHaveBeenCalled();
  });

  it("reports hashchange and popstate, with an empty string for no hash", async () => {
    render(<Probe />);
    await flushFrame();
    onHash.mockClear();

    act(() => {
      window.history.pushState(null, "", "/info#warranty");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(onHash).toHaveBeenLastCalledWith("warranty", "change");

    act(() => {
      window.history.replaceState(null, "", "/info");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(onHash).toHaveBeenLastCalledWith("", "change");
  });

  it("ignores back/forward to another page", async () => {
    render(<Probe />);
    await flushFrame();
    onHash.mockClear();

    act(() => {
      window.history.replaceState(null, "", "/contact#faq");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(onHash).not.toHaveBeenCalled();
  });

  it("stops listening on unmount", async () => {
    const { unmount } = render(<Probe />);
    await flushFrame();
    unmount();
    onHash.mockClear();

    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(onHash).not.toHaveBeenCalled();
  });
});
