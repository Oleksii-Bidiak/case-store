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
  }: {
    src: string;
    alt: string;
    blurDataURL?: string;
    placeholder?: string;
    onError?: () => void;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      data-placeholder={placeholder}
      data-blur={blurDataURL}
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
