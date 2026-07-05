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
  }: {
    src: string;
    alt: string;
    blurDataURL?: string;
    placeholder?: string;
    onError?: () => void;
    sizes?: string;
    preload?: boolean;
    loading?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
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
      "(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc(50vw - 2rem), 300px",
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
