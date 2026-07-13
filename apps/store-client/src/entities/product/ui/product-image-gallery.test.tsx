import type { ProductImageEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
} from "@/shared/test/render";
import {
  IMAGE_LOADING_INDICATOR_DELAY_MS,
  ProductImageGallery,
} from "./product-image-gallery";

const image = (id: string, sortOrder: number): ProductImageEntity => ({
  id,
  url: `https://cdn.example.com/${id}.jpg`,
  alt: `Image ${id}`,
  sortOrder,
  isPrimary: sortOrder === 0,
});

/**
 * Regression guard for TASK-126: the thumbnail strip is intentionally gated on
 * `images.length > 1`. A single image shows the main image with no strip (a lone
 * thumbnail duplicating the main image would be redundant) — this is correct
 * design, not the reported bug. The "missing thumbnails" report was a seed-data
 * gap (most products seeded with one image), deferred to TASK-128.
 */
describe("ProductImageGallery — thumbnail strip gate (TASK-126)", () => {
  it("renders no thumbnail strip for a single image", () => {
    renderWithProviders(
      <ProductImageGallery images={[image("a", 0)]} altFallback="Product" />,
    );

    // Main image present, but no thumbnail buttons.
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a thumbnail button per image when there are several", () => {
    renderWithProviders(
      <ProductImageGallery
        images={[image("a", 0), image("b", 1), image("c", 2)]}
        altFallback="Product"
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("swaps the active thumbnail on click (aria-pressed follows selection)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProductImageGallery
        images={[image("a", 0), image("b", 1)]}
        altFallback="Product"
      />,
    );

    const [first, second] = screen.getAllByRole("button");
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveAttribute("aria-pressed", "false");

    await user.click(second);

    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(second).toHaveAttribute("aria-pressed", "true");
  });
});

/**
 * TASK-214 — image-switch loading indicator. Switching the main image shows a
 * spinner overlay only after IMAGE_LOADING_INDICATOR_DELAY_MS (so instant cache
 * hits never flash it), removes it on `onLoad`, and gives up on `onError`
 * (fallback placeholder, no eternal spinner).
 */
describe("ProductImageGallery — image-switch loading indicator (TASK-214)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** The main-frame <img> (thumbnails live inside buttons; the main one does not). */
  const mainImage = (name: string): HTMLElement => {
    const match = screen
      .getAllByRole("img", { name })
      .find((el) => el.closest("button") === null);
    if (!match) throw new Error(`main image "${name}" not found`);
    return match;
  };

  const queryIndicator = () =>
    screen.queryByRole("status", { name: dict.product.imageLoading });

  /**
   * next/image defers the user `onLoad` callback behind an `img.decode()`
   * promise chain — fire the DOM event inside an async act() so the microtasks
   * flush before asserting.
   */
  const fireLoad = async (name: string) => {
    await act(async () => {
      fireEvent.load(mainImage(name));
    });
  };

  const setup = async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    renderWithProviders(
      <ProductImageGallery
        images={[image("a", 0), image("b", 1)]}
        altFallback="Product"
      />,
    );
    // Settle the initial image so only the switch is pending in the tests.
    await fireLoad("Image a");
    return user;
  };

  it("shows the indicator after the delay while the new image loads, and removes it on load", async () => {
    const user = await setup();

    const [, second] = screen.getAllByRole("button");
    await user.click(second);

    // Within the grace window — no indicator yet.
    expect(queryIndicator()).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(IMAGE_LOADING_INDICATOR_DELAY_MS + 10);
    });
    expect(queryIndicator()).toBeInTheDocument();

    // Incoming image finishes loading — indicator disappears.
    await fireLoad("Image b");
    expect(queryIndicator()).not.toBeInTheDocument();
  });

  it("never flashes the indicator when the image loads within the delay (cache hit)", async () => {
    const user = await setup();

    const [, second] = screen.getAllByRole("button");
    await user.click(second);
    // Loads immediately — before the delay elapses.
    await fireLoad("Image b");

    act(() => {
      jest.advanceTimersByTime(IMAGE_LOADING_INDICATOR_DELAY_MS * 3);
    });
    expect(queryIndicator()).not.toBeInTheDocument();

    // Switching back to an already-loaded image is also indicator-free.
    const [first] = screen.getAllByRole("button");
    await user.click(first);
    act(() => {
      jest.advanceTimersByTime(IMAGE_LOADING_INDICATOR_DELAY_MS * 3);
    });
    expect(queryIndicator()).not.toBeInTheDocument();
  });

  it("clears the indicator and falls back to the placeholder on error", async () => {
    const user = await setup();

    const [, second] = screen.getAllByRole("button");
    await user.click(second);
    act(() => {
      jest.advanceTimersByTime(IMAGE_LOADING_INDICATOR_DELAY_MS + 10);
    });
    expect(queryIndicator()).toBeInTheDocument();

    // Image fails — no eternal spinner; the styled placeholder takes over.
    fireEvent.error(mainImage("Image b"));
    expect(queryIndicator()).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "Image b" }),
    ).not.toBeInTheDocument();
  });
});
