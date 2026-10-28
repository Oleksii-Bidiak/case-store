import { render, screen } from "@testing-library/react";
import { dict } from "@/shared/config";
import { PreviewBar } from "./preview-bar";
import { PreviewInvalidNote } from "./preview-invalid-note";

let pathname = "/";
jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

describe("PreviewBar (TASK-669)", () => {
  it("is a labelled region saying this is a preview, with an exit back to the same page", () => {
    pathname = "/products/draft-case";
    render(<PreviewBar expiresAt={null} />);

    const bar = screen.getByRole("region", { name: dict.preview.barLabel });
    expect(bar).toHaveTextContent(dict.preview.title);
    const exit = screen.getByRole("link", { name: dict.preview.exit });
    expect(exit).toHaveAttribute(
      "href",
      "/preview/exit?to=%2Fproducts%2Fdraft-case",
    );
  });

  it("is pinned to the bottom, above a page's own fixed mobile bar", () => {
    render(<PreviewBar expiresAt={null} />);

    const bar = screen.getByRole("region", { name: dict.preview.barLabel });
    expect(bar).toHaveClass("fixed", "bottom-above-mobile-bar");
  });

  it("says the homepage on / and until when the link works, in Kyiv time", () => {
    pathname = "/";
    render(<PreviewBar expiresAt="2026-10-06T11:30:00.000Z" />);

    expect(
      screen.getByText(
        `${dict.preview.homeHint} · ${dict.preview.expires("6 жовтня, 14:30")}`,
      ),
    ).toBeInTheDocument();
  });

  it("says «сторінку» anywhere else", () => {
    pathname = "/blog/draft";
    render(<PreviewBar expiresAt={null} />);

    expect(screen.getByText(dict.preview.pageHint)).toBeInTheDocument();
  });

  it("gives the exit a touch-size target and a visible focus outline", () => {
    render(<PreviewBar expiresAt={null} />);

    const exit = screen.getByRole("link", { name: dict.preview.exit });
    expect(exit).toHaveClass("h-11", "focus-visible:outline-2");
  });
});

describe("PreviewInvalidNote (TASK-669)", () => {
  it("announces the refused link once, as a status", () => {
    render(<PreviewInvalidNote />);

    expect(screen.getByRole("status")).toHaveTextContent(dict.preview.invalid);
  });
});
