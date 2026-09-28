import { fireEvent, render, screen } from "@testing-library/react";
import { FallbackImg } from "./fallback-img";

const URL_A = "https://cdn.example.com/a.jpg";
const URL_B = "https://cdn.example.com/b.jpg";

describe("FallbackImg (TASK-759)", () => {
  it("renders the picture as a plain img with the given alt", () => {
    const { container } = render(
      <FallbackImg src={URL_A} alt="" className="size-full" />,
    );

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", URL_A);
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveClass("size-full");
  });

  it("renders the fallback when there is no URL", () => {
    render(<FallbackImg src={null} alt="" fallback={<span>заглушка</span>} />);

    expect(screen.getByText("заглушка")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("swaps in the fallback when the picture fails (e.g. blocked by the CSP)", () => {
    const { container } = render(
      <FallbackImg src={URL_A} alt="" fallback={<span>заглушка</span>} />,
    );

    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("заглушка")).toBeInTheDocument();
  });

  it("renders nothing by default after a failure, so a backdrop shows", () => {
    const { container } = render(<FallbackImg src={URL_A} alt="" />);

    fireEvent.error(container.querySelector("img")!);

    expect(container).toBeEmptyDOMElement();
  });

  it("tries a new URL again on the same mounted element", () => {
    const { container, rerender } = render(<FallbackImg src={URL_A} alt="" />);
    fireEvent.error(container.querySelector("img")!);

    rerender(<FallbackImg src={URL_B} alt="" />);

    expect(container.querySelector("img")).toHaveAttribute("src", URL_B);
  });

  // The cover is server-rendered: its load can end before hydration attaches
  // onError. jsdom loads nothing, so the "already settled" state is stubbed.
  describe("a load that settled before hydration", () => {
    const proto = HTMLImageElement.prototype;

    afterEach(() => {
      jest.restoreAllMocks();
    });

    /**
     * How many times `src` is written while mounting in the given load state.
     * React itself writes it once; a replay is one write more. The baseline is
     * a picture still loading — nothing to replay there.
     */
    function srcWritesOnMount(complete: boolean, naturalWidth: number) {
      jest.spyOn(proto, "complete", "get").mockReturnValue(complete);
      jest.spyOn(proto, "naturalWidth", "get").mockReturnValue(naturalWidth);
      const srcSetter = jest.spyOn(proto, "src", "set");
      srcSetter.mockClear();
      const { unmount } = render(<FallbackImg src={URL_A} alt="" />);
      const writes = srcSetter.mock.calls.length;
      unmount();
      return writes;
    }

    it("replays a load that already failed, so onError fires with the handler attached", () => {
      const stillLoading = srcWritesOnMount(false, 0);

      expect(srcWritesOnMount(true, 0)).toBe(stillLoading + 1);
    });

    it("leaves a picture that already loaded alone", () => {
      const stillLoading = srcWritesOnMount(false, 0);

      expect(srcWritesOnMount(true, 640)).toBe(stillLoading);
    });
  });
});
