import { renderWithProviders, screen } from "@/shared/test/render";
import { BLUR_PLACEHOLDER } from "./image-placeholder";
import { ProductCardImage } from "./product-card-image";

/**
 * Mock `next/image` to a plain `<img>` that surfaces the `placeholder` and
 * `blurDataURL` props as data attributes. The real component embeds
 * `blurDataURL` inside an inline `background-image` SVG that jsdom's CSSOM drops,
 * so mocking is the reliable way to assert which placeholder each card renders.
 */
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    blurDataURL,
    placeholder,
    onError,
    sizes,
    preload,
    loading,
    className,
  }: {
    src: string;
    alt: string;
    blurDataURL?: string;
    placeholder?: string;
    onError?: () => void;
    sizes?: string;
    preload?: boolean;
    loading?: string;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      data-placeholder={placeholder}
      data-blur={blurDataURL}
      data-sizes={sizes}
      data-preload={String(preload)}
      data-loading={String(loading)}
      onError={onError}
    />
  ),
}));

const PER_IMAGE_LQIP = "data:image/webp;base64,PERIMAGELQIPMARKER";

describe("ProductCardImage (TASK-091)", () => {
  it("uses the per-image LQIP as the blur placeholder when provided", () => {
    renderWithProviders(
      <ProductCardImage
        src="https://cdn.example.com/case.webp"
        alt="Clear case"
        initial="C"
        blurDataUrl={PER_IMAGE_LQIP}
      />,
    );

    const img = screen.getByRole("img", { name: "Clear case" });
    expect(img).toHaveAttribute("data-placeholder", "blur");
    expect(img).toHaveAttribute("data-blur", PER_IMAGE_LQIP);
  });

  it("falls back to the generic shimmer when no LQIP is provided", () => {
    renderWithProviders(
      <ProductCardImage
        src="https://cdn.example.com/case.webp"
        alt="Clear case"
        initial="C"
      />,
    );

    const img = screen.getByRole("img", { name: "Clear case" });
    expect(img).toHaveAttribute("data-placeholder", "blur");
    expect(img).toHaveAttribute("data-blur", BLUR_PLACEHOLDER);
  });

  // An empty string is not an LQIP. `??` passed it straight through, and
  // `placeholder="blur"` with an empty `blurDataURL` renders no placeholder at
  // all (next/image throws on it in dev) — so a blank value must fall back to
  // the shared shimmer, while a real per-image LQIP still wins (TASK-415).
  it("falls back to the shared shimmer when the LQIP is an empty string", () => {
    renderWithProviders(
      <ProductCardImage
        src="https://cdn.example.com/case.webp"
        alt="Clear case"
        initial="C"
        blurDataUrl=""
      />,
    );

    expect(screen.getByRole("img", { name: "Clear case" })).toHaveAttribute(
      "data-blur",
      BLUR_PLACEHOLDER,
    );
  });

  it("renders the gradient initial (no img) when there is no src", () => {
    renderWithProviders(
      <ProductCardImage
        alt="No image"
        initial="N"
        blurDataUrl={PER_IMAGE_LQIP}
      />,
    );

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("N")).toBeInTheDocument();
  });
});

describe("ProductCardImage — fit & motion (TASK-415)", () => {
  // Accessory photos come in mixed aspect ratios; `object-cover` cropped plugs,
  // straps and case edges out of the square card box. The box keeps its fixed
  // ratio (no layout shift) and the photo is letterboxed inside it instead.
  it("fits the whole photo into the card box instead of cropping it", () => {
    renderWithProviders(
      <ProductCardImage
        src="https://cdn.example.com/case.webp"
        alt="Clear case"
        initial="C"
      />,
    );

    const img = screen.getByRole("img", { name: "Clear case" });
    expect(img).toHaveClass("object-contain");
    expect(img).not.toHaveClass("object-cover");
  });

  // The hover zoom is declared here and only here — card wrappers used to add a
  // second `[&_img]:transition-transform` whose descendant selector won, so the
  // duration declared next to the scale never actually ran.
  it("owns the hover zoom, and disables it under prefers-reduced-motion", () => {
    renderWithProviders(
      <ProductCardImage
        src="https://cdn.example.com/case.webp"
        alt="Clear case"
        initial="C"
      />,
    );

    const img = screen.getByRole("img", { name: "Clear case" });
    expect(img).toHaveClass("group-hover:scale-105", "transition-transform");
    expect(img).toHaveClass("motion-reduce:transition-none");
  });
});

describe("ProductCardImage — lazy loading & sizes (TASK-210)", () => {
  it("defaults to the catalog-grid sizes profile", () => {
    renderWithProviders(
      <ProductCardImage
        src="https://cdn.example.com/case.webp"
        alt="Clear case"
        initial="C"
      />,
    );

    expect(screen.getByRole("img", { name: "Clear case" })).toHaveAttribute(
      "data-sizes",
      // First stop is 389px, not 639px: the grid goes two-up at 390px
      // (TASK-415), so a 390–639px viewport must not be told to fetch a
      // full-viewport candidate for a half-width card.
      "(max-width: 389px) calc(100vw - 2rem), (max-width: 1023px) calc(50vw - 2rem), 300px",
    );
  });

  it("uses the caller's sizes for fixed-width slots", () => {
    renderWithProviders(
      <ProductCardImage
        src="https://cdn.example.com/case.webp"
        alt="Clear case"
        initial="C"
        sizes="150px"
      />,
    );

    expect(screen.getByRole("img", { name: "Clear case" })).toHaveAttribute(
      "data-sizes",
      "150px",
    );
  });

  it("does not preload by default and leaves `loading` to next/image's lazy default", () => {
    renderWithProviders(
      <ProductCardImage
        src="https://cdn.example.com/case.webp"
        alt="Clear case"
        initial="C"
      />,
    );

    const img = screen.getByRole("img", { name: "Clear case" });
    // `preload={false}` + no `loading` prop → next/image renders
    // `loading="lazy"` (its default); passing `loading` alongside `preload`
    // would throw in next/image, so the component must NOT set it.
    expect(img).toHaveAttribute("data-preload", "false");
    expect(img).toHaveAttribute("data-loading", "undefined");
  });

  it("preloads only when the card is explicitly prioritized", () => {
    renderWithProviders(
      <ProductCardImage
        src="https://cdn.example.com/case.webp"
        alt="Clear case"
        initial="C"
        priority
      />,
    );

    expect(screen.getByRole("img", { name: "Clear case" })).toHaveAttribute(
      "data-preload",
      "true",
    );
  });
});
