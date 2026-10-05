import { render, screen } from "@testing-library/react";

import { Skeleton } from "./skeleton";

/**
 * Skeleton's default `rounded-md` must give way to a caller's radius. Tailwind
 * v4 emits radius utilities alphabetically, so leaving both classes on the
 * element lets `rounded-md` beat `rounded-card` / `rounded-lg` / `rounded-2xl`
 * in the cascade — the skeleton would not match the card it stands in for.
 */
describe("Skeleton", () => {
  it("keeps the default radius when the caller sets none", () => {
    render(<Skeleton className="h-10" />);
    expect(screen.getByRole("status")).toHaveClass("rounded-md");
  });

  it.each(["rounded-card", "rounded-lg", "rounded-2xl", "rounded-full"])(
    "drops rounded-md when the caller passes %s",
    (radius) => {
      render(<Skeleton className={`h-10 ${radius}`} />);
      const el = screen.getByRole("status");
      expect(el).toHaveClass(radius);
      expect(el).not.toHaveClass("rounded-md");
    },
  );

  it("stays an aria-busy status region", () => {
    render(<Skeleton />);
    const el = screen.getByRole("status");
    expect(el).toHaveAttribute("aria-busy", "true");
    expect(el).toHaveClass("animate-pulse", "bg-muted");
  });
});
