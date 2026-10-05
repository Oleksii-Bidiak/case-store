import { render, screen, within } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { OrderTrustStrip } from "./order-trust-strip";

describe("OrderTrustStrip (TASK-864)", () => {
  it("lists secure payment, delivery and returns under a named list", () => {
    render(<OrderTrustStrip />);

    const list = screen.getByRole("list", { name: dict.trust.orderAria });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      dict.trust.secure,
      dict.trust.orderDelivery,
      dict.trust.returns,
    ]);
  });

  it("never promises free delivery (TASK-881)", () => {
    render(<OrderTrustStrip />);

    expect(screen.queryByText(/безкоштовн/i)).not.toBeInTheDocument();
  });
});
