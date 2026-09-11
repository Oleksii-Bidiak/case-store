import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { OrderPaymentPanel } from "./order-payment-panel";

/**
 * OrderPaymentPanel — what the shopper is told about the money, and when they
 * are offered a way to pay again (TASK-330-B / TASK-407).
 *
 * The panel had TWO retry branches (a FAILED payment and a PENDING one whose
 * callback never arrived) and neither looked at the order. So a shopper who
 * cancelled an order with a declined card was still invited to «Спробувати ще
 * раз» — a button that could only ever come back 409. These tests pin both
 * branches against every closed order status.
 */
const copy = dict.order.payment;

function renderPanel(
  props: Partial<React.ComponentProps<typeof OrderPaymentPanel>> = {},
) {
  return renderWithProviders(
    <OrderPaymentPanel
      orderId="order-1"
      paymentStatus="FAILED"
      orderStatus="PENDING"
      hasRecentAttempt
      isAwaitingCallback={false}
      {...props}
    />,
    { auth: { isAuthenticated: true, accessToken: "token" } },
  );
}

const retryButton = () => screen.queryByRole("button", { name: copy.retry });

describe("OrderPaymentPanel — an open order", () => {
  it("offers a retry on a failed payment", () => {
    renderPanel({ paymentStatus: "FAILED", orderStatus: "PENDING" });

    expect(screen.getByText(copy.failedTitle)).toBeInTheDocument();
    expect(retryButton()).toBeInTheDocument();
  });

  it("offers a retry when the callback never arrived", () => {
    renderPanel({
      paymentStatus: "PENDING",
      orderStatus: "CONFIRMED",
      hasRecentAttempt: true,
      isAwaitingCallback: false,
    });

    expect(screen.getByText(copy.slowTitle)).toBeInTheDocument();
    expect(retryButton()).toBeInTheDocument();
  });

  it("says nothing at all to a cash-on-delivery shopper who never went off to pay", () => {
    const { container } = renderPanel({
      paymentStatus: "PENDING",
      orderStatus: "CONFIRMED",
      hasRecentAttempt: false,
    });

    expect(container).toBeEmptyDOMElement();
  });
});

describe("OrderPaymentPanel — a closed order (TASK-407)", () => {
  it.each(["CANCELLED", "REFUNDED"] as const)(
    "hides the failed-payment retry on a %s order and says the order is cancelled",
    (orderStatus) => {
      renderPanel({ paymentStatus: "FAILED", orderStatus });

      expect(screen.getByText(copy.orderCancelledTitle)).toBeInTheDocument();
      expect(retryButton()).not.toBeInTheDocument();
      expect(screen.queryByText(copy.failedTitle)).not.toBeInTheDocument();
    },
  );

  it.each(["CANCELLED", "REFUNDED"] as const)(
    "hides the slow-callback retry on a %s order too — both branches, not one",
    (orderStatus) => {
      renderPanel({
        paymentStatus: "PENDING",
        orderStatus,
        hasRecentAttempt: true,
        isAwaitingCallback: false,
      });

      expect(screen.getByText(copy.orderCancelledTitle)).toBeInTheDocument();
      expect(retryButton()).not.toBeInTheDocument();
      expect(screen.queryByText(copy.slowTitle)).not.toBeInTheDocument();
    },
  );

  it("hides the retry on a DELIVERED order and does not call it cancelled", () => {
    renderPanel({ paymentStatus: "FAILED", orderStatus: "DELIVERED" });

    expect(screen.getByText(copy.orderClosedTitle)).toBeInTheDocument();
    expect(
      screen.queryByText(copy.orderCancelledTitle),
    ).not.toBeInTheDocument();
    expect(retryButton()).not.toBeInTheDocument();
  });

  it("stays silent on a DELIVERED cash-on-delivery order — nothing to report", () => {
    const { container } = renderPanel({
      paymentStatus: "PENDING",
      orderStatus: "DELIVERED",
      hasRecentAttempt: false,
    });

    expect(container).toBeEmptyDOMElement();
  });

  it("still reports a PAID payment on a cancelled order — the money is the money", () => {
    // The closed-order branch must never overwrite what the server said about
    // the money: a cancelled-but-paid order is exactly when the shopper needs to
    // read "оплату отримано" and call us.
    renderPanel({ paymentStatus: "PAID", orderStatus: "CANCELLED" });

    expect(screen.getByText(copy.paidTitle)).toBeInTheDocument();
    expect(retryButton()).not.toBeInTheDocument();
  });

  it("still reports a REFUNDED payment on a cancelled order", () => {
    renderPanel({ paymentStatus: "REFUNDED", orderStatus: "CANCELLED" });

    expect(screen.getByText(copy.refundedTitle)).toBeInTheDocument();
    expect(retryButton()).not.toBeInTheDocument();
  });
});
