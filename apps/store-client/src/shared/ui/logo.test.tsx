import { render, screen, fireEvent } from "@testing-library/react";
import { SITE_NAME } from "@/shared/config";
import { Logo } from "./logo";

/** store-api uploads origin — allow-listed in next.config.ts by default. */
const RASTER_LOGO = "http://localhost:3001/uploads/branding/logo.webp";
const SVG_LOGO = "http://localhost:3001/uploads/branding/logo.svg";

describe("Logo (TASK-299)", () => {
  it("renders the typographic monogram + wordmark when no logo is uploaded", () => {
    render(<Logo />);

    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText(SITE_NAME)).toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });

  it("treats null / blank logoUrl as no logo", () => {
    const { rerender } = render(<Logo logoUrl={null} />);
    expect(screen.getByText(SITE_NAME)).toBeInTheDocument();

    rerender(<Logo logoUrl="   " />);
    expect(screen.getByText(SITE_NAME)).toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });

  it("routes a raster logo on the uploads origin through the next/image optimizer", () => {
    render(<Logo logoUrl={RASTER_LOGO} />);

    const img = screen.getByRole("img", { name: SITE_NAME });
    const src = img.getAttribute("src") ?? "";
    expect(src).toContain("/_next/image");
    expect(src).toContain(encodeURIComponent(RASTER_LOGO));
    // The image carries the brand name — the wordmark is not duplicated.
    expect(screen.queryByText(SITE_NAME)).not.toBeInTheDocument();
  });

  it("serves an SVG logo as a plain <img>, never through the optimizer", () => {
    // `next/image` would need images.dangerouslyAllowSVG, which we deliberately
    // keep off — the optimizer must never be asked to render SVG.
    render(<Logo logoUrl={SVG_LOGO} />);

    const img = screen.getByRole("img", { name: SITE_NAME });
    expect(img).toHaveAttribute("src", SVG_LOGO);
    expect(img.getAttribute("src")).not.toContain("/_next/image");
  });

  it("ignores a query string / fragment when detecting SVG", () => {
    render(<Logo logoUrl={`${SVG_LOGO}?v=2`} />);

    const img = screen.getByRole("img", { name: SITE_NAME });
    expect(img).toHaveAttribute("src", `${SVG_LOGO}?v=2`);
  });

  it("serves a raster logo from a non-allow-listed host as a plain <img> (next/image would throw)", () => {
    const foreign = "https://cdn.not-allowed.example/logo.png";
    render(<Logo logoUrl={foreign} />);

    const img = screen.getByRole("img", { name: SITE_NAME });
    expect(img).toHaveAttribute("src", foreign);
    expect(img.getAttribute("src")).not.toContain("/_next/image");
  });

  it("reserves the box with explicit width/height (no layout shift)", () => {
    render(<Logo logoUrl={SVG_LOGO} />);

    const img = screen.getByRole("img", { name: SITE_NAME });
    expect(img).toHaveAttribute("width", "160");
    expect(img).toHaveAttribute("height", "36");
  });

  it("falls back to the monogram when the logo fails to load", () => {
    render(<Logo logoUrl={SVG_LOGO} />);

    fireEvent.error(screen.getByRole("img", { name: SITE_NAME }));

    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText(SITE_NAME)).toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });

  it("recovers to a newly-uploaded logo after an earlier one failed to load", () => {
    // Header/footer persist across client navigations, so a stale error flag must
    // not mask a logo uploaded later in the same session (new logoUrl via ISR).
    const { rerender } = render(<Logo logoUrl={SVG_LOGO} />);

    fireEvent.error(screen.getByRole("img", { name: SITE_NAME }));
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();

    const NEW_LOGO = "http://localhost:3001/uploads/branding/logo-v2.svg";
    rerender(<Logo logoUrl={NEW_LOGO} />);

    const img = screen.getByRole("img", { name: SITE_NAME });
    expect(img).toHaveAttribute("src", NEW_LOGO);
    expect(screen.queryByText("M")).not.toBeInTheDocument();
  });

  it("applies the caller's wrapper / monogram classes", () => {
    const { container } = render(
      <Logo className="gap-2.5" markClassName="shadow-elevated" />,
    );

    expect(container.firstChild).toHaveClass("gap-2.5");
    expect(screen.getByText("M")).toHaveClass("shadow-elevated");
  });
});
