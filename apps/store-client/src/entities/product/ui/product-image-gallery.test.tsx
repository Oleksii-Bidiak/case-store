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
    // The visible gesture hint doubles as the description (TASK-521).
    expect(
      within(dialog).getByText(dict.product.lightboxHintPointer(true)),
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

/**
 * TASK-518: the PDP photo follows the ProductCard rule (design-system.md §4) —
 * a fixed square box with the card gradient behind it and `object-contain`
 * inside, so photos in other aspect ratios are letterboxed, never cropped.
 */
describe("ProductImageGallery — letterboxed photos (TASK-518)", () => {
  const renderGallery = () =>
    renderWithProviders(
      <ProductImageGallery
        images={[image("a", 0), image("b", 1)]}
        altFallback="Product"
      />,
    );

  it("letterboxes the main photo over the card gradient inside a square box", () => {
    renderGallery();

    const frame = screen.getByTestId("gallery-main-frame");
    expect(frame).toHaveClass("aspect-square", "bg-gradient-to-br");
    expect(frame).not.toHaveClass("bg-muted");

    const main = within(frame).getByRole("img", { name: "Image a" });
    expect(main).toHaveClass("object-contain");
    expect(main).not.toHaveClass("object-cover");
  });

  it("letterboxes every thumbnail over the same gradient", () => {
    renderGallery();

    for (const button of thumbnails()) {
      expect(button).toHaveClass("size-16", "bg-gradient-to-br");
      const thumb = within(button).getByRole("img");
      expect(thumb).toHaveClass("object-contain");
      expect(thumb).not.toHaveClass("object-cover");
    }
  });

  it("keeps the selection ring on the active thumbnail only", async () => {
    const user = userEvent.setup();
    renderGallery();

    await user.click(thumbnails()[1]);

    const [first, second] = thumbnails();
    expect(second).toHaveClass("border-primary");
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveClass("border-border");
    expect(first).not.toHaveClass("border-primary");
  });
});

/**
 * TASK-832 — the mockup's layering note: the visible «На весь екран» chip sits
 * in the frame's bottom-right corner at 44px, clear of the consumer's top-right
 * wishlist heart, and its label stays inside the trigger's accessible name.
 */
describe("ProductImageGallery — zoom chip (TASK-832)", () => {
  it("labels the chip «На весь екран» inside the trigger's accessible name", () => {
    renderWithProviders(
      <ProductImageGallery images={[image("a", 0)]} altFallback="Product" />,
    );

    const trigger = screen.getByRole("button", { name: dict.product.zoomAria });
    const chip = within(trigger).getByTestId("gallery-zoom-chip");
    expect(chip).toHaveTextContent(dict.product.zoomChip);
    expect(chip).toHaveClass("right-3", "bottom-3", "h-11");
    // WCAG 2.5.3 — the visible words are part of the spoken name.
    expect(dict.product.zoomAria.toLowerCase()).toContain(
      dict.product.zoomChip.toLowerCase(),
    );
  });
});

/**
 * TASK-521 — zoom inside the lightbox: a toolbar (− · value · + · reset) with
 * 100 → 150 → 250 → 400 % stops, click / double-tap zoom, keyboard panning when
 * zoomed, Escape resetting the zoom before it closes, a minimap and a
 * thumbnail strip that switches the photo and resets the zoom.
 */
describe("ProductImageGallery — lightbox zoom (TASK-521)", () => {
  const THREE = [image("a", 0), image("b", 1), image("c", 2)];

  const fireTouch = (
    target: Element,
    type: string,
    clientX: number,
    clientY = 200,
  ) => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, "changedTouches", {
      value: [{ clientX, clientY }],
    });
    fireEvent(target, event);
  };

  const toolbarOf = (dialog: HTMLElement) =>
    within(dialog).getByRole("toolbar", {
      name: dict.product.lightboxZoomToolbar,
    });

  /** The toolbar's live value — an `<output>` (implicit role «status»). */
  const valueOf = (dialog: HTMLElement) =>
    within(toolbarOf(dialog)).getByRole("status");

  const openLightbox = async (images = THREE) => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProductImageGallery images={images} altFallback="Product" />,
    );
    await user.click(
      screen.getByRole("button", { name: dict.product.zoomAria }),
    );
    const dialog = await screen.findByRole("dialog");
    const button = (name: string) =>
      within(toolbarOf(dialog)).getByRole("button", { name });
    return {
      user,
      dialog,
      zoomIn: () => button(dict.product.lightboxZoomIn),
      zoomOut: () => button(dict.product.lightboxZoomOut),
      reset: () => button(dict.product.lightboxZoomReset),
      value: () => valueOf(dialog),
    };
  };

  it("offers a labelled zoom toolbar with − and reset disabled at 100 %", async () => {
    const { zoomIn, zoomOut, reset, value } = await openLightbox();

    expect(value()).toHaveTextContent("100%");
    expect(value()).toHaveAttribute("aria-live", "polite");
    expect(zoomOut()).toHaveAttribute("aria-disabled", "true");
    expect(reset()).toHaveAttribute("aria-disabled", "true");
    expect(zoomIn()).toHaveAttribute("aria-disabled", "false");
    // 44px touch targets.
    for (const control of [zoomOut(), zoomIn(), reset()]) {
      expect(control).toHaveClass("size-11");
    }
  });

  it("steps «+» through 150, 250 and 400 % and «−» / reset back down", async () => {
    const { user, zoomIn, zoomOut, reset, value } = await openLightbox();

    await user.click(zoomIn());
    expect(value()).toHaveTextContent("150%");
    expect(zoomOut()).toHaveAttribute("aria-disabled", "false");
    await user.click(zoomIn());
    expect(value()).toHaveTextContent("250%");
    await user.click(zoomIn());
    expect(value()).toHaveTextContent("400%");
    expect(zoomIn()).toHaveAttribute("aria-disabled", "true");

    await user.click(zoomOut());
    expect(value()).toHaveTextContent("250%");
    await user.click(reset());
    expect(value()).toHaveTextContent("100%");
    expect(reset()).toHaveAttribute("aria-disabled", "true");
  });

  it("zooms to 250 % on a click on the photo, with a minimap and no arrows", async () => {
    const { user, dialog, value } = await openLightbox();
    expect(within(dialog).queryByTestId("lightbox-minimap")).toBeNull();

    await user.click(within(dialog).getByRole("img", { name: "Image a" }));

    expect(value()).toHaveTextContent("250%");
    expect(within(dialog).getByTestId("lightbox-minimap")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      within(dialog).queryByRole("button", { name: dict.product.lightboxNext }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: dict.product.lightboxPrev }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(dict.product.lightboxHintPointerZoomed),
    ).toBeInTheDocument();
  });

  it("pans with the arrow keys when zoomed instead of switching photos", async () => {
    const { user, dialog, zoomIn } = await openLightbox();
    await user.click(zoomIn());

    await user.keyboard("{ArrowRight}");

    expect(
      within(dialog).getByText(dict.product.lightboxCounter(1, 3)),
    ).toBeInTheDocument();
  });

  it("resets the zoom on the first Escape and closes on the second", async () => {
    const { user, zoomIn, value } = await openLightbox();
    await user.click(zoomIn());

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(value()).toHaveTextContent("100%");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("zooms in on a double tap and back out on the next one", async () => {
    const { dialog, value } = await openLightbox();
    const photo = within(dialog).getByRole("img", { name: "Image a" });

    fireTouch(photo, "touchstart", 150);
    fireTouch(photo, "touchend", 150);
    fireTouch(photo, "touchstart", 152);
    fireTouch(photo, "touchend", 152);
    expect(value()).toHaveTextContent("250%");

    fireTouch(photo, "touchstart", 150);
    fireTouch(photo, "touchend", 150);
    fireTouch(photo, "touchstart", 150);
    fireTouch(photo, "touchend", 150);
    expect(value()).toHaveTextContent("100%");
  });

  it("does not swipe to another photo while zoomed", async () => {
    const { user, dialog, zoomIn } = await openLightbox();
    await user.click(zoomIn());
    const photo = within(dialog).getByRole("img", { name: "Image a" });

    fireTouch(photo, "touchstart", 300);
    fireTouch(photo, "touchend", 300 - SWIPE_THRESHOLD_PX - 40);

    expect(
      within(dialog).getByText(dict.product.lightboxCounter(1, 3)),
    ).toBeInTheDocument();
  });

  it("switches photo from its thumbnail strip, marks it current and resets the zoom", async () => {
    const { user, dialog, zoomIn, value } = await openLightbox();
    const strip = within(dialog).getByRole("list", {
      name: dict.product.lightboxThumbnails,
    });
    const thumbs = within(strip).getAllByRole("button");
    expect(thumbs).toHaveLength(3);
    expect(thumbs[0]).toHaveAttribute("aria-current", "true");
    expect(thumbs[0]).toHaveClass("size-14", "sm:size-16", "border-primary");

    await user.click(zoomIn());
    await user.click(thumbs[2]);

    expect(
      within(dialog).getByText(dict.product.lightboxCounter(3, 3)),
    ).toBeInTheDocument();
    expect(thumbs[2]).toHaveAttribute("aria-current", "true");
    expect(thumbs[0]).not.toHaveAttribute("aria-current");
    expect(value()).toHaveTextContent("100%");
  });

  it("resets the zoom when stepping to another photo and on reopening", async () => {
    const { user, dialog, zoomIn, value } = await openLightbox();
    await user.click(zoomIn());
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowRight}");
    expect(
      within(dialog).getByText(dict.product.lightboxCounter(2, 3)),
    ).toBeInTheDocument();
    expect(value()).toHaveTextContent("100%");

    await user.click(zoomIn());
    expect(value()).toHaveTextContent("150%");
    await user.click(
      within(dialog).getByRole("button", { name: dict.common.close }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: dict.product.zoomAria }),
    );
    const reopened = await screen.findByRole("dialog");
    expect(valueOf(reopened)).toHaveTextContent("100%");
  });

  it("keeps the zoom toolbar for a single photo but no strip", async () => {
    const { dialog, value } = await openLightbox([image("a", 0)]);

    expect(value()).toHaveTextContent("100%");
    expect(
      within(dialog).queryByRole("list", {
        name: dict.product.lightboxThumbnails,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(dict.product.lightboxHintPointer(false)),
    ).toBeInTheDocument();
  });
});
