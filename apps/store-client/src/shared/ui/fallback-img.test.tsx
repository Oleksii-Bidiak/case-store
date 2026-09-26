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
});
