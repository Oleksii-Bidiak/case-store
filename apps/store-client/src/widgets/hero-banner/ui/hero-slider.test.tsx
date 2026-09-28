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
});
