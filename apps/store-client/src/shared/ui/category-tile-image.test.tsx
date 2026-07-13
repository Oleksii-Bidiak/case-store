import { render, screen, fireEvent } from "@testing-library/react";
import {
  CategoryTileImage,
  isOptimizableImageSrc,
} from "./category-tile-image";

/** An allowlisted host that needs no env setup (dev-seed placeholder origin). */
const ALLOWED = "https://picsum.photos/seed/cases/800/800";

describe("CategoryTileImage", () => {
  it("routes an allowlisted image through the next/image optimizer", () => {
    render(
      <CategoryTileImage
        src={ALLOWED}
        alt="Чохли"
        className="size-full"
        fallback={<span data-testid="fallback" />}
      />,
    );

    const img = screen.getByRole("img", { name: "Чохли" });
    // next/image rewrites `src` to the optimizer route with the original URL
    // encoded in `?url=` — the plain <img> passthrough is gone (TASK-289).
    const src = img.getAttribute("src") ?? "";
    expect(src).toContain("/_next/image");
    expect(src).toContain(encodeURIComponent(ALLOWED));
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
        src={ALLOWED}
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
          src="https://picsum.photos/seed/a/800/800"
          alt="A"
          fallback={<span data-testid="fallback-a" />}
        />
        <CategoryTileImage
          src="https://picsum.photos/seed/b/800/800"
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

  /**
   * The admin can paste any URL into `Category.image`. A host outside
   * `images.remotePatterns` makes `next/image` throw at render time in dev (and
   * 400 at the optimizer in prod), so the component must never hand it one.
   */
  it("renders the fallback for a host outside the allowlist", () => {
    render(
      <CategoryTileImage
        src="https://evil.example.com/tracker.png"
        alt="Категорія"
        fallback={<span data-testid="fallback" />}
      />,
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });
});

describe("isOptimizableImageSrc", () => {
  const ORIGINAL_HOSTS = process.env.NEXT_PUBLIC_IMAGE_HOSTS;

  afterEach(() => {
    if (ORIGINAL_HOSTS === undefined) {
      delete process.env.NEXT_PUBLIC_IMAGE_HOSTS;
    } else {
      process.env.NEXT_PUBLIC_IMAGE_HOSTS = ORIGINAL_HOSTS;
    }
  });

  it("allows the store-api uploads path on the configured API origin", () => {
    expect(
      isOptimizableImageSrc("http://localhost:3001/uploads/branding/logo.webp"),
    ).toBe(true);
  });

  it("rejects other paths on the API origin (the remote pattern pins /uploads/)", () => {
    expect(isOptimizableImageSrc("http://localhost:3001/api/products")).toBe(
      false,
    );
  });

  it("allows the dev-seed placeholder host over https", () => {
    expect(isOptimizableImageSrc("https://picsum.photos/seed/x/800/800")).toBe(
      true,
    );
    expect(isOptimizableImageSrc("http://picsum.photos/seed/x/800/800")).toBe(
      false,
    );
  });

  it("allows an operator-configured host, https only", () => {
    process.env.NEXT_PUBLIC_IMAGE_HOSTS = " cdn.mystore.ua , images.brand.com ";

    expect(isOptimizableImageSrc("https://cdn.mystore.ua/cases.jpg")).toBe(
      true,
    );
    expect(isOptimizableImageSrc("https://images.brand.com/a.png")).toBe(true);
    // Plaintext on the same host is not in remotePatterns (https-only entries).
    expect(isOptimizableImageSrc("http://cdn.mystore.ua/cases.jpg")).toBe(
      false,
    );
    // Neighbouring host that merely shares a suffix must not slip through.
    expect(isOptimizableImageSrc("https://cdn.mystore.ua.evil.com/x.jpg")).toBe(
      false,
    );
  });

  it("rejects non-http(s) schemes and unparseable values", () => {
    expect(isOptimizableImageSrc("data:image/svg+xml;base64,PHN2Zy8+")).toBe(
      false,
    );
    expect(isOptimizableImageSrc("javascript:alert(1)")).toBe(false);
    expect(isOptimizableImageSrc("/uploads/local.png")).toBe(false);
    expect(isOptimizableImageSrc("not a url")).toBe(false);
  });
});
