import { render, screen } from "@/shared/test/render";
import { CartSkeleton } from "./cart-skeleton";

/**
 * TASK-869 — the cart skeleton reproduces the populated CartView, not a
 * generic three-column grid, so the page does not jump when the cart arrives.
 */
describe("CartSkeleton (TASK-869)", () => {
  it("is hidden from assistive tech", () => {
    render(<CartSkeleton />);
    expect(screen.getByTestId("cart-skeleton")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("uses the page's [1fr_380px] grid from lg, not grid-cols-3", () => {
    render(<CartSkeleton />);
    const grid = screen.getByTestId("cart-skeleton-grid");
    expect(grid).toHaveClass("grid", "gap-6", "lg:grid-cols-[1fr_380px]");
    expect(grid).not.toHaveClass("lg:grid-cols-3");
    // Line-items card + aside (summary card and trust strip).
    expect(grid.children).toHaveLength(2);
    expect(grid.children[0]).toHaveClass("rounded-card", "shadow-card");
  });

  it("reserves the h1 slot at H1_CLASS line heights", () => {
    render(<CartSkeleton />);
    expect(screen.getByTestId("cart-skeleton-title")).toHaveClass(
      "h-9",
      "md:h-10",
    );
  });
});
