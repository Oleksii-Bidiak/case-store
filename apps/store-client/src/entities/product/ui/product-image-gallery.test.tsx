import type { ProductImageEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import {
  IMAGE_LOADING_INDICATOR_DELAY_MS,
  ProductImageGallery,
  SWIPE_THRESHOLD_PX,
} from "./product-image-gallery";

const image = (id: string, sortOrder: number): ProductImageEntity => ({
  id,
  url: `https://cdn.example.com/${id}.jpg`,
  alt: `Image ${id}`,
  sortOrder,
  isPrimary: sortOrder === 0,
});

/**
 * The thumbnail buttons only — scoped through the strip's `<ul>` so the
 * full-frame zoom trigger (TASK-416) never leaks into these queries.
 */
const thumbnails = () =>
  within(screen.getByRole("list")).getAllByRole("button");

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

    // Main image present, but no thumbnail strip at all.
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    // The only button on a single-image gallery is the zoom trigger.
    expect(screen.getAllByRole("button")).toEqual([
      screen.getByRole("button", { name: dict.product.zoomAria }),
    ]);
  });

  it("renders a thumbnail button per image when there are several", () => {
    renderWithProviders(
      <ProductImageGallery
        images={[image("a", 0), image("b", 1), image("c", 2)]}
        altFallback="Product"
      />,
    );

    expect(thumbnails()).toHaveLength(3);
  });

  it("swaps the active thumbnail on click (aria-pressed follows selection)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProductImageGallery
        images={[image("a", 0), image("b", 1)]}
        altFallback="Product"
      />,
    );

    const [first, second] = thumbnails();
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

    const [, second] = thumbnails();
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

    const [, second] = thumbnails();
    await user.click(second);
    // Loads immediately — before the delay elapses.
    await fireLoad("Image b");

    act(() => {
      jest.advanceTimersByTime(IMAGE_LOADING_INDICATOR_DELAY_MS * 3);
    });
    expect(queryIndicator()).not.toBeInTheDocument();

    // Switching back to an already-loaded image is also indicator-free.
    const [first] = thumbnails();
    await user.click(first);
    act(() => {
      jest.advanceTimersByTime(IMAGE_LOADING_INDICATOR_DELAY_MS * 3);
    });
    expect(queryIndicator()).not.toBeInTheDocument();
  });

  it("clears the indicator and falls back to the placeholder on error", async () => {
    const user = await setup();

    const [, second] = thumbnails();
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

/**
 * TASK-416 — full-screen lightbox. The zoom trigger overlays the main frame;
 * inside the dialog the photo can be stepped with the arrow buttons, the arrow
 * keys and a horizontal swipe, Escape closes it (Radix), and focus lands back
 * on the trigger rather than at the top of the document.
 */
describe("ProductImageGallery — lightbox (TASK-416)", () => {
  const THREE = [image("a", 0), image("b", 1), image("c", 2)];

  /**
   * jsdom implements neither `Touch` nor `TouchEvent`, so RTL's
   * `fireEvent.touchStart(el, { changedTouches })` silently drops the
   * coordinates. Build a bubbling Event and attach `changedTouches` by hand —
   * React reads the property straight off the native event when it builds the
   * synthetic one.
   */
  const fireTouch = (target: Element, type: string, clientX: number) => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, "changedTouches", { value: [{ clientX }] });
    fireEvent(target, event);
  };

  const openLightbox = async (images = THREE) => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProductImageGallery images={images} altFallback="Product" />,
    );
    const trigger = screen.getByRole("button", { name: dict.product.zoomAria });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog");
    return { user, trigger, dialog };
  };

  it("opens the full-screen dialog from the zoom trigger and names the product", async () => {
    const { dialog } = await openLightbox();

    expect(
      within(dialog).getByText(dict.product.lightboxTitle("Product")),
    ).toBeInTheDocument();
    // A description is rendered, so Radix's aria-describedby stays wired up.
    expect(dialog).toHaveAttribute("aria-describedby");
    expect(
      within(dialog).getByText(dict.product.lightboxHint),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(dict.product.lightboxCounter(1, 3)),
    ).toBeInTheDocument();
  });

  it("steps through photos with the next/prev buttons, wrapping at both ends", async () => {
    const { user, dialog } = await openLightbox();

    await user.click(
      within(dialog).getByRole("button", { name: dict.product.lightboxNext }),
    );
    expect(
      within(dialog).getByText(dict.product.lightboxCounter(2, 3)),
    ).toBeInTheDocument();

    // Backwards past the first photo wraps round to the last one.
    await user.click(
      within(dialog).getByRole("button", { name: dict.product.lightboxPrev }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: dict.product.lightboxPrev }),
    );
    expect(
      within(dialog).getByText(dict.product.lightboxCounter(3, 3)),
    ).toBeInTheDocument();
  });

  it("steps through photos with the left/right arrow keys", async () => {
    const { user, dialog } = await openLightbox();

    await user.keyboard("{ArrowRight}");
    expect(
      within(dialog).getByText(dict.product.lightboxCounter(2, 3)),
    ).toBeInTheDocument();

    await user.keyboard("{ArrowLeft}");
    expect(
      within(dialog).getByText(dict.product.lightboxCounter(1, 3)),
    ).toBeInTheDocument();
  });

  it("advances on a left swipe and goes back on a right swipe", async () => {
    const { dialog } = await openLightbox();
    const surface = within(dialog).getByRole("img");

    fireTouch(surface, "touchstart", 300);
    fireTouch(surface, "touchend", 300 - SWIPE_THRESHOLD_PX - 10);
    expect(
      within(dialog).getByText(dict.product.lightboxCounter(2, 3)),
    ).toBeInTheDocument();

    fireTouch(surface, "touchstart", 100);
    fireTouch(surface, "touchend", 100 + SWIPE_THRESHOLD_PX + 10);
    expect(
      within(dialog).getByText(dict.product.lightboxCounter(1, 3)),
    ).toBeInTheDocument();
  });

  it("ignores a drag shorter than the swipe threshold", async () => {
    const { dialog } = await openLightbox();
    const surface = within(dialog).getByRole("img");

    fireTouch(surface, "touchstart", 300);
    fireTouch(surface, "touchend", 300 - (SWIPE_THRESHOLD_PX - 5));

    expect(
      within(dialog).getByText(dict.product.lightboxCounter(1, 3)),
    ).toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the zoom trigger", async () => {
    const { user, trigger } = await openLightbox();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps the lightbox selection in sync with the thumbnail strip", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProductImageGallery images={THREE} altFallback="Product" />,
    );

    await user.click(thumbnails()[2]);
    await user.click(
      screen.getByRole("button", { name: dict.product.zoomAria }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(dict.product.lightboxCounter(3, 3)),
    ).toBeInTheDocument();
  });

  it("offers no arrows or counter for a single photo", async () => {
    const { dialog } = await openLightbox([image("a", 0)]);

    expect(
      within(dialog).queryByRole("button", { name: dict.product.lightboxNext }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: dict.product.lightboxPrev }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText(dict.product.lightboxCounter(1, 1)),
    ).not.toBeInTheDocument();
  });

  it("offers no zoom trigger when the photo failed to load", () => {
    renderWithProviders(
      <ProductImageGallery images={[image("a", 0)]} altFallback="Product" />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Image a" }));

    expect(
      screen.queryByRole("button", { name: dict.product.zoomAria }),
    ).not.toBeInTheDocument();
  });
});
