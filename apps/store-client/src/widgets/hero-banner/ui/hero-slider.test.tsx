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
      screen.getByRole("heading", { level: 1, name: slides[0].title }),
    ).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(AUTOPLAY_MS));

    expect(
      screen.getByRole("heading", { level: 1, name: slides[1].title }),
    ).toBeInTheDocument();
  });

  it("does not auto-advance when the user prefers reduced motion", () => {
    setReducedMotion(true);
    render(<HeroSlider />);

    expect(
      screen.getByRole("heading", { level: 1, name: slides[0].title }),
    ).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(AUTOPLAY_MS * 2));

    // Still on the first slide — the autoplay interval never armed.
    expect(
      screen.getByRole("heading", { level: 1, name: slides[0].title }),
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
      screen.getByRole("heading", { level: 1, name: slides[0].title }),
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

  it("draws a white offset focus outline on the slide CTA — the indigo ring vanishes on the slide (TASK-865)", () => {
    setReducedMotion(false);
    render(<HeroSlider />);

    const cta = screen.getByRole("link", { name: slides[0].cta });
    expect(cta).toHaveClass(
      "focus-visible:ring-0",
      "focus-visible:outline-solid",
      "focus-visible:outline-offset-2",
      "focus-visible:outline-white",
    );
  });
});

describe("HeroSlider — responsive height (TASK-878)", () => {
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("reserves the tallest slide's height with inert, invisible sizers — one h1, no hidden links", () => {
    setReducedMotion(true);
    const { container } = render(<HeroSlider />);

    const sizers = container.querySelectorAll("[data-slide-sizer]");
    expect(sizers).toHaveLength(slides.length - 1);
    for (const sizer of sizers) {
      expect(sizer).toHaveAttribute("aria-hidden", "true");
      expect(sizer).toHaveAttribute("inert");
      expect(sizer.className).toContain("invisible");
      expect(sizer.querySelector("h1, a")).toBeNull();
    }

    // Exactly one page h1 and one CTA link — the active slide's.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(container.querySelectorAll("a")).toHaveLength(1);

    // Below lg no fixed height: the box grows with the copy above a min
    // height. From lg it is pinned at 440px so the sidebar row cannot stretch it.
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass("grid", "min-h-105", "sm:min-h-110", "lg:h-110");
    expect(root).not.toHaveClass("h-110");
    expect(root).not.toHaveClass("sm:h-110");
    expect(root.className).not.toMatch(/\bh-\[/);
  });

  it("gives the copy the full width on a phone — px-6, the side gutters only from sm", () => {
    setReducedMotion(true);
    render(<HeroSlider />);

    const layer = screen.getByRole("heading", { level: 1 }).parentElement
      ?.parentElement as HTMLElement;
    expect(layer).toHaveClass("px-6", "sm:px-24");
    expect(layer).not.toHaveClass("px-16");
  });

  it("keeps the prev / next / pause controls at a 44px touch target", () => {
    setReducedMotion(true);
    render(<HeroSlider />);

    for (const name of [
      dict.home.hero.prevSlide,
      dict.home.hero.nextSlide,
      dict.home.hero.pauseAutoplay,
    ]) {
      const control = screen.getByRole("button", { name });
      expect(control).toHaveClass("size-11");
      expect(control).not.toHaveClass("size-10");
    }
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
      screen.getByRole("heading", { level: 1, name: "Без картинки" }),
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
