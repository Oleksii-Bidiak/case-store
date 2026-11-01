import { act, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/shared/config";
import type { BannerEntity } from "@/shared/api/generated/models";
import { HeroSlider } from "./hero-slider";

const AUTOPLAY_MS = 7000;
const slides = dict.home.hero.slides;

/** Point `window.matchMedia` at a fixed reduced-motion answer for one test. */
function setReducedMotion(matches: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe("HeroSlider", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
    window.matchMedia = originalMatchMedia;
  });

  it("auto-advances after the interval when motion is allowed", () => {
    setReducedMotion(false);
    render(<HeroSlider />);

    expect(
      screen.getByRole("heading", { level: 2, name: slides[0].title }),
    ).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(AUTOPLAY_MS));

    expect(
      screen.getByRole("heading", { level: 2, name: slides[1].title }),
    ).toBeInTheDocument();
  });

  it("does not auto-advance when the user prefers reduced motion", () => {
    setReducedMotion(true);
    render(<HeroSlider />);

    expect(
      screen.getByRole("heading", { level: 2, name: slides[0].title }),
    ).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(AUTOPLAY_MS * 2));

    // Still on the first slide — the autoplay interval never armed.
    expect(
      screen.getByRole("heading", { level: 2, name: slides[0].title }),
    ).toBeInTheDocument();
  });

  it("pauses autoplay and toggles aria-pressed when the pause button is clicked", () => {
    setReducedMotion(false);
    render(<HeroSlider />);

    const pauseButton = screen.getByRole("button", {
      name: dict.home.hero.pauseAutoplay,
    });
    expect(pauseButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(pauseButton);

    // Label + pressed state flip to the resume affordance.
    const resumeButton = screen.getByRole("button", {
      name: dict.home.hero.resumeAutoplay,
    });
    expect(resumeButton).toHaveAttribute("aria-pressed", "true");

    act(() => jest.advanceTimersByTime(AUTOPLAY_MS * 2));

    // Paused: the slide never advanced past the first.
    expect(
      screen.getByRole("heading", { level: 2, name: slides[0].title }),
    ).toBeInTheDocument();
  });

  it("gives each dot indicator a 44px invisible hit-area", () => {
    setReducedMotion(false);
    render(<HeroSlider />);

    const dots = slides.map((_, i) =>
      screen.getByRole("button", { name: dict.home.hero.goToSlide(i + 1) }),
    );
    expect(dots).toHaveLength(slides.length);
    for (const dot of dots) {
      expect(dot.className).toContain("before:size-11");
    }
  });

  it("draws an offset focus outline in the slide's text colour on the CTA — the graphite ring vanishes on a dark slide (TASK-865)", () => {
    setReducedMotion(true);
    render(<HeroSlider />);

    // Slide 1 is the iPhone family tone: the outline is `foreground`.
    const familyCta = screen.getByRole("link", { name: slides[0].cta });
    expect(familyCta).toHaveClass(
      "focus-visible:ring-0",
      "focus-visible:outline-solid",
      "focus-visible:outline-offset-2",
      "focus-visible:outline-foreground",
    );

    // Slide 2 is the ink panel: the theme-invariant white outline.
    fireEvent.click(
      screen.getByRole("button", { name: dict.home.hero.nextSlide }),
    );
    const inkCta = screen.getByRole("link", { name: slides[1].cta });
    expect(inkCta).toHaveClass("focus-visible:outline-footer-foreground");
  });
});

describe("HeroSlider — responsive height (TASK-878)", () => {
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("reserves the tallest slide's height with inert, invisible sizers — one slide h2, no h1, no hidden links", () => {
    setReducedMotion(true);
    const { container } = render(<HeroSlider />);

    const sizers = container.querySelectorAll("[data-slide-sizer]");
    expect(sizers).toHaveLength(slides.length - 1);
    for (const sizer of sizers) {
      expect(sizer).toHaveAttribute("aria-hidden", "true");
      expect(sizer).toHaveAttribute("inert");
      expect(sizer.className).toContain("invisible");
      expect(sizer.querySelector("h1, h2, a")).toBeNull();
    }

    // Exactly one slide heading and one CTA link — the active slide's; the
    // page h1 is the device picker above the block (TASK-1952).
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(container.querySelectorAll("a")).toHaveLength(1);

    // No fixed height at any width: the box grows with the copy above a min
    // height. TASK-2013 — from lg it sits in a 2/3 column beside the promo
    // tiles, which take ITS height; a pinned lg:h-110 would clip the copy.
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass(
      "grid",
      "min-h-105",
      "sm:min-h-110",
      "rounded-panel",
    );
    expect(root.className).not.toMatch(/(^|s)(sm:|lg:)?h-110/);
    expect(root.className).not.toMatch(/\bh-\[/);
  });

  it("pads the slide 24px on a phone and 40px from md, with two columns (copy 6 + art 5) from md — no side gutters for arrows", () => {
    setReducedMotion(true);
    const { container } = render(<HeroSlider />);

    const slide = screen.getByRole("group", {
      name: dict.home.hero.slideAria(1, slides.length, slides[0].title),
    });
    expect(slide).toHaveClass("px-6", "md:p-10", "md:grid-cols-11");
    expect(slide.className).not.toMatch(/sm:px-24/);

    const copy = screen.getByRole("heading", { level: 2 })
      .parentElement as HTMLElement;
    expect(copy).toHaveClass("md:col-span-6");

    const art = slide.querySelector("[data-slide-art]") as HTMLElement;
    expect(art).toHaveClass(
      "hidden",
      "md:flex",
      "md:col-span-5",
      "min-h-50",
      "rounded-lg",
    );
    expect(art).toHaveAttribute("aria-hidden", "true");
    // The fallback iPhone slide carries the big display word on the art.
    expect(art).toHaveTextContent(slides[0].big as string);
    expect(container.querySelectorAll("[data-slide-art]")).toHaveLength(
      slides.length,
    );
  });

  it("puts the dots, pause, previous and next in one bottom row of light 44px buttons", () => {
    setReducedMotion(true);
    render(<HeroSlider />);

    const pause = screen.getByRole("button", {
      name: dict.home.hero.pauseAutoplay,
    });
    const prev = screen.getByRole("button", { name: dict.home.hero.prevSlide });
    const next = screen.getByRole("button", { name: dict.home.hero.nextSlide });
    const row = pause.parentElement as HTMLElement;
    expect(row).toHaveClass("absolute", "inset-x-6", "bottom-5", "flex");
    // Order: dots group, pause, prev, next.
    expect([...row.children].slice(1)).toEqual([pause, prev, next]);
    expect(row.children[0]).toContainElement(
      screen.getByRole("button", { name: dict.home.hero.goToSlide(1) }),
    );

    for (const control of [pause, prev, next]) {
      expect(control).toHaveClass(
        "size-11",
        "bg-card/85",
        "text-foreground",
        "hover:bg-muted",
      );
      expect(control.className).not.toMatch(/\b(?:bg-white|text-slate)/);
    }
  });
});

describe("HeroSlider — tones and carousel semantics (TASK-2013)", () => {
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function banner(id: string, title: string, theme: string | null) {
    return {
      id,
      placement: "HERO_SLIDE",
      title,
      theme,
      sortOrder: 0,
      status: "PUBLISHED",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    } as BannerEntity;
  }

  it("colours the fallback slides by device family or the ink panel — never a decorative gradient", () => {
    setReducedMotion(true);
    const { container } = render(<HeroSlider />);
    const root = container.firstElementChild as HTMLElement;
    const next = screen.getByRole("button", { name: dict.home.hero.nextSlide });

    expect(root).toHaveAttribute("data-slide-tone", "iphone");
    expect(root).toHaveClass("bg-family-iphone", "text-foreground");
    expect(root.getAttribute("style")).toBeNull();

    fireEvent.click(next);
    expect(root).toHaveAttribute("data-slide-tone", "ink");
    expect(root).toHaveClass("bg-footer", "text-footer-foreground");

    fireEvent.click(next);
    expect(root).toHaveAttribute("data-slide-tone", "galaxy");
    expect(root).toHaveClass("bg-family-galaxy");
  });

  it("takes an admin slide's tone from its banner theme", () => {
    setReducedMotion(true);
    const { container } = render(
      <HeroSlider
        banners={[
          banner("b1", "Для Galaxy", "galaxy"),
          banner("b2", "Зелений", "success"),
        ]}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass("bg-family-galaxy");

    fireEvent.click(
      screen.getByRole("button", { name: dict.home.hero.nextSlide }),
    );
    // `success` is no family: the ink panel, not a green slide.
    expect(root).toHaveAttribute("data-slide-tone", "ink");
  });

  it("is a named carousel region with one labelled slide, live only while autoplay is off", () => {
    setReducedMotion(false);
    jest.useFakeTimers();
    render(<HeroSlider />);

    const region = screen.getByRole("region", {
      name: dict.home.hero.carouselAria,
    });
    expect(region).toHaveAttribute("aria-roledescription", "carousel");
    const slide = screen.getByRole("group", {
      name: dict.home.hero.slideAria(1, slides.length, slides[0].title),
    });
    expect(slide).toHaveAttribute("aria-roledescription", "slide");

    const live = slide.parentElement as HTMLElement;
    expect(live).toHaveAttribute("aria-live", "off");
    fireEvent.click(
      screen.getByRole("button", { name: dict.home.hero.pauseAutoplay }),
    );
    expect(live).toHaveAttribute("aria-live", "polite");
    jest.useRealTimers();
  });

  it("draws no art panel for an admin slide without a picture — the copy takes both columns", () => {
    setReducedMotion(true);
    const { container } = render(
      <HeroSlider banners={[banner("b1", "Без картинки", null)]} />,
    );
    expect(container.querySelector("[data-slide-art]")).toBeNull();
    expect(screen.getByRole("heading", { level: 2 }).parentElement).toHaveClass(
      "md:col-span-11",
    );
  });
});

describe("HeroSlider — banner pictures (TASK-740)", () => {
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function heroBanner(
    id: string,
    title: string,
    imageUrl: string | null,
  ): BannerEntity {
    return {
      id,
      placement: "HERO_SLIDE",
      title,
      subtitle: null,
      imageUrl,
      imageBlurDataUrl: null,
      ctaLabel: null,
      ctaHref: null,
      theme: null,
      sortOrder: 0,
      status: "PUBLISHED",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
  }

  it("shows the active slide's uploaded picture, and only the gradient without one", () => {
    setReducedMotion(true);
    const imageUrl = "http://localhost:3001/uploads/banners/hero-1.webp";
    const { container } = render(
      <HeroSlider
        banners={[
          heroBanner("b1", "З картинкою", imageUrl),
          heroBanner("b2", "Без картинки", null),
        ]}
      />,
    );

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img?.getAttribute("src")).toContain(encodeURIComponent(imageUrl));

    fireEvent.click(
      screen.getByRole("button", { name: dict.home.hero.nextSlide }),
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Без картинки" }),
    ).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows no CTA for a slide the owner left without a link (TASK-873)", () => {
    setReducedMotion(true);
    const { container } = render(
      <HeroSlider
        banners={[
          {
            ...heroBanner("b1", "Без посилання", null),
            ctaLabel: "Детальніше",
          },
        ]}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /Детальніше/ }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('a[href="#"]')).toBeNull();
  });
});
