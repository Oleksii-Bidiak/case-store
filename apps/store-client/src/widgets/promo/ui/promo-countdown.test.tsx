import { render, screen } from "@testing-library/react";
import { dict } from "@/shared/config";
import { PromoCountdown } from "./promo-countdown";

const c = dict.promo.countdown;

describe("PromoCountdown", () => {
  it("exposes one labelled timer with the four day/hour/minute/second cells", () => {
    render(<PromoCountdown />);

    const timer = screen.getByRole("timer", { name: c.aria });
    for (const label of [c.days, c.hours, c.minutes, c.seconds]) {
      expect(timer).toHaveTextContent(label);
    }
  });

  // TASK-498 — four fixed 62px tiles need 272px; the promo hero leaves ~224px
  // of content at 320 and ~264px at 360, and its `overflow-hidden` clipped the
  // seconds tile. Below `sm` the strip shares the hero width as a 4-col grid
  // whose tiles may shrink; the fixed tile width comes back from `sm`.
  it("shares the hero width on phones and keeps fixed tiles from sm", () => {
    render(<PromoCountdown />);

    const timer = screen.getByRole("timer", { name: c.aria });
    expect(timer).toHaveClass("grid", "w-full", "grid-cols-4", "sm:flex");

    const tiles = Array.from(timer.children);
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) {
      expect(tile).toHaveClass("min-w-0", "sm:min-w-15.5");
      expect(tile.className).not.toMatch(/(^|\s)min-w-\[/);
    }
  });
});
