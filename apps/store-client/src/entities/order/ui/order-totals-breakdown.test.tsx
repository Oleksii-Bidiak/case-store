import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { OrderTotalsBreakdown } from "./order-totals-breakdown";

const base = {
  subtotal: "998.00",
  discount: "0.00",
  tax: "0.00",
  total: "998.00",
};

function shippingCell() {
  return screen.getByText(dict.order.shipping)
    .nextElementSibling as HTMLElement;
}

/**
 * TASK-647: «Доставка» in the order summary has three faces, and a booked 0
 * nobody priced is never «Безкоштовно».
 */
describe("OrderTotalsBreakdown — delivery (TASK-647)", () => {
  it("prints a priced delivery as money, with no note", () => {
    renderWithProviders(
      <OrderTotalsBreakdown {...base} shippingCost="70.00" total="1068.00" />,
    );
    expect(shippingCell().textContent?.replace(/\s/g, "")).toBe("70₴");
    expect(
      screen.queryByText(dict.order.deliveryBlock.totalWithoutShipping),
    ).toBeNull();
  });

  it("reads a free delivery as «Безкоштовно» (pickup, courier over the threshold)", () => {
    renderWithProviders(<OrderTotalsBreakdown {...base} shippingCost="0.00" />);
    expect(shippingCell()).toHaveTextContent(dict.order.shippingFree);
    expect(
      screen.queryByText(dict.order.deliveryBlock.totalWithoutShipping),
    ).toBeNull();
  });

  it("says «Уточнить оператор» in muted italic and notes the total under «Разом»", () => {
    renderWithProviders(
      <OrderTotalsBreakdown {...base} shippingCost="0.00" shippingPending />,
    );
    expect(shippingCell()).toHaveTextContent(dict.order.shippingPending);
    expect(shippingCell()).toHaveClass("italic", "text-muted-foreground");
    expect(screen.queryByText(dict.order.shippingFree)).toBeNull();
    expect(
      screen.getByText(dict.order.deliveryBlock.totalWithoutShipping),
    ).toHaveClass("text-xs");
  });

  it("lets a quoted sum win over a stale pending flag", () => {
    renderWithProviders(
      <OrderTotalsBreakdown
        {...base}
        shippingCost="120.00"
        shippingPending
        total="1118.00"
      />,
    );
    expect(shippingCell().textContent?.replace(/\s/g, "")).toBe("120₴");
    expect(
      screen.queryByText(dict.order.deliveryBlock.totalWithoutShipping),
    ).toBeNull();
  });
});
