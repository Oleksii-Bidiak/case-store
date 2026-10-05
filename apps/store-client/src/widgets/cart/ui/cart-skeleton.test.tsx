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

  it("uses the page's grid-cols-checkout grid from lg, not grid-cols-3", () => {
    render(<CartSkeleton />);
    const grid = screen.getByTestId("cart-skeleton-grid");
    expect(grid).toHaveClass("grid", "gap-6", "lg:grid-cols-checkout");
    expect(grid).not.toHaveClass("lg:grid-cols-3");
    // Line-items card + aside (summary card and trust strip).
    expect(grid.children).toHaveLength(2);
    expect(grid.children[0]).toHaveClass("rounded-card", "shadow-card");
  });

  it("wraps the stepper and the line total like CartItemRow, so they stack in the mobile column", () => {
    render(<CartSkeleton />);
    for (const actions of screen.getAllByTestId("cart-skeleton-row-actions")) {
      expect(actions).toHaveClass("flex", "flex-wrap", "justify-between");
      // The stepper placeholder is the real stepper's 118×38 box.
      expect(actions.children[0]).toHaveClass("h-9.5", "w-29.5");
    }
  });

  it("reserves three title lines below md and one from md", () => {
    render(<CartSkeleton />);
    for (const title of screen.getAllByTestId("cart-skeleton-row-title")) {
      const lines = Array.from(title.children).filter((el) =>
        el.classList.contains("h-5.5"),
      );
      expect(lines).toHaveLength(3);
      expect(lines[0]).not.toHaveClass("md:hidden");
      expect(lines[1]).toHaveClass("md:hidden");
      expect(lines[2]).toHaveClass("md:hidden");
    }
  });

  it("reserves the h1 slot at H1_CLASS line heights", () => {
    render(<CartSkeleton />);
    expect(screen.getByTestId("cart-skeleton-title")).toHaveClass(
      "h-9",
      "md:h-10",
    );
  });
});
