import { render, screen } from "@testing-library/react";
import { formatOrderNumber } from "./format-order-number";
import { OrderNumber } from "../ui/order-number";

/**
 * TASK-1038: an order is called «#7C1E9A42» everywhere — the first eight
 * characters of its id, upper-cased, no «…» — with the full id one hover away.
 * The dashboard, the registry, the order card and the toasts must agree, which
 * is why this lives in the order entity and not in each screen.
 */
const ID = "7c1e9a42-5b1d-4e8a-9c6f-2d7b8e1a4c50";

describe("formatOrderNumber", () => {
  it("is # + the first 8 characters of the id, upper-cased", () => {
    expect(formatOrderNumber(ID)).toBe("#7C1E9A42");
  });

  it("does not pad or ellipsise a short id", () => {
    expect(formatOrderNumber("ab12")).toBe("#AB12");
  });
});

describe("OrderNumber", () => {
  it("renders the short number in mono with the full id as its title", () => {
    render(<OrderNumber id={ID} />);
    const number = screen.getByText("#7C1E9A42");
    expect(number).toHaveAttribute("title", ID);
    expect(number).toHaveClass("font-mono");
  });
});
