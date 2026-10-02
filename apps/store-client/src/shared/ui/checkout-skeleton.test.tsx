import { render, screen } from "@testing-library/react";
import { CheckoutSkeleton } from "./checkout-skeleton";

/**
 * TASK-869 — the checkout skeleton reproduces the step-1 CheckoutView: h1 slot,
 * stepper and the `[1fr_380px]` grid, so the page does not jump on load.
 */
describe("CheckoutSkeleton (TASK-869)", () => {
  it("is hidden from assistive tech", () => {
    render(<CheckoutSkeleton />);
    expect(screen.getByTestId("checkout-skeleton")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("uses the page's [1fr_380px] grid from lg, not grid-cols-3", () => {
    render(<CheckoutSkeleton />);
    const grid = screen.getByTestId("checkout-skeleton-grid");
    expect(grid).toHaveClass("grid", "gap-6", "lg:grid-cols-[1fr_380px]");
    expect(grid).not.toHaveClass("lg:grid-cols-3");
    expect(grid.children).toHaveLength(2);
  });

  it("reserves the h1 slot: two lines below sm, one from sm", () => {
    render(<CheckoutSkeleton />);
    const title = screen.getByTestId("checkout-skeleton-title");
    expect(title).toHaveClass("mb-6");
    const [first, second] = Array.from(title.children);
    expect(first).toHaveClass("h-9", "md:h-10");
    expect(second).toHaveClass("h-9", "sm:hidden");
  });

  it("renders a three-step stepper like CheckoutStepIndicator", () => {
    render(<CheckoutSkeleton />);
    const stepper = screen.getByTestId("checkout-skeleton-stepper");
    expect(stepper).toHaveClass("mb-7", "flex-wrap", "gap-2");
    expect(stepper.querySelectorAll(".size-7.rounded-full")).toHaveLength(3);
    // Connectors between the steps only.
    expect(stepper.querySelectorAll(".h-px.w-7")).toHaveLength(2);
  });
});
