import { render, screen, fireEvent } from "@testing-library/react";
import { CategoryTileImage } from "./category-tile-image";

describe("CategoryTileImage", () => {
  it("renders the image when src is set", () => {
    render(
      <CategoryTileImage
        src="https://cdn.example.com/cases.jpg"
        alt="Чохли"
        className="size-full"
        fallback={<span data-testid="fallback" />}
      />,
    );

    const img = screen.getByRole("img", { name: "Чохли" });
    expect(img).toHaveAttribute("src", "https://cdn.example.com/cases.jpg");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveClass("size-full");
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("renders the fallback when src is absent", () => {
    render(
      <CategoryTileImage alt="" fallback={<span data-testid="fallback" />} />,
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });

  it("renders the fallback when src is null", () => {
    render(
      <CategoryTileImage
        src={null}
        alt=""
        fallback={<span data-testid="fallback" />}
      />,
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
  });

  it("falls back after the image fails to load", () => {
    render(
      <CategoryTileImage
        src="https://cdn.example.com/broken.jpg"
        alt="Категорія"
        fallback={<span data-testid="fallback" />}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Категорія" }));

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });

  it("keeps failure state local to each instance", () => {
    render(
      <>
        <CategoryTileImage
          src="https://cdn.example.com/a.jpg"
          alt="A"
          fallback={<span data-testid="fallback-a" />}
        />
        <CategoryTileImage
          src="https://cdn.example.com/b.jpg"
          alt="B"
          fallback={<span data-testid="fallback-b" />}
        />
      </>,
    );

    fireEvent.error(screen.getByRole("img", { name: "A" }));

    // Only the failed instance swaps to its fallback; the sibling keeps its <img>.
    expect(screen.getByTestId("fallback-a")).toBeInTheDocument();
    expect(screen.queryByTestId("fallback-b")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "B" })).toBeInTheDocument();
  });
});
