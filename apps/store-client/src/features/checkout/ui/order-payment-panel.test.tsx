import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";
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

describe("OrderPaymentPanel — an unpaid online order (TASK-217)", () => {
  const awaiting = { minutes: 23, until: "14:52", total: "3 200 ₴" };

  it("says how long the goods are held and offers ONE primary «Оплатити»", () => {
    const { container } = renderPanel({
      paymentStatus: "PENDING",
      orderStatus: "PENDING",
      hasRecentAttempt: false,
      awaiting,
    });

    expect(
      screen.getByText(dict.orderHistory.awaitingPayment(23)),
    ).toBeInTheDocument();
    expect(screen.getByText(copy.awaitingBody("14:52"))).toBeInTheDocument();
    const primary = container.querySelectorAll(
      '[data-slot="button"][data-variant="default"]',
    );
    expect(primary).toHaveLength(1);
    expect(primary[0]).toHaveTextContent(dict.orderHistory.pay("3 200 ₴"));
  });

  it("lets a recent attempt win: «Підтверджуємо…», not a second «Оплатити»", () => {
    renderPanel({
      paymentStatus: "PENDING",
      orderStatus: "PENDING",
      hasRecentAttempt: true,
      isAwaitingCallback: true,
      awaiting,
    });

    expect(screen.getByText(copy.pendingTitle)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stays silent once the reservation has lapsed (0 minutes)", () => {
    const { container } = renderPanel({
      paymentStatus: "PENDING",
      orderStatus: "PENDING",
      hasRecentAttempt: false,
      awaiting: { ...awaiting, minutes: 0 },
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

/**
 * R2 A4 (TASK-2047 / TASK-2340): a prepaid order. Part of the money came in
 * (the operator recorded it), the rest is paid on delivery or by transfer — an
 * online attempt would charge the whole total again, so the API refuses it and
 * the panel offers none.
 */
describe("OrderPaymentPanel — a partly paid order (R2 A4)", () => {
  it("says «Сплачено X з Y» and offers no way to pay", () => {
    renderPanel({
      paymentStatus: "PARTIALLY_PAID",
      orderStatus: "CONFIRMED",
      hasRecentAttempt: false,
      partial: { paidKop: 50_000, total: "1200.00" },
    });

    expect(screen.getByText(copy.partiallyPaidTitle)).toBeInTheDocument();
    expect(
      screen.getByText(
        copy.partiallyPaidBody(formatMoney("500.00"), formatMoney("1200.00")),
        // formatMoney groups with a no-break space; the default normalizer
        // would turn it into a plain one on the page side only.
        { normalizer: (text) => text },
      ),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("offers no «Оплатити» even with the reservation still running", () => {
    renderPanel({
      paymentStatus: "PARTIALLY_PAID",
      orderStatus: "PENDING",
      hasRecentAttempt: true,
      isAwaitingCallback: false,
      partial: { paidKop: 1, total: "10.00" },
      awaiting: { minutes: 23, until: "14:52", total: "10 ₴" },
    });

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
