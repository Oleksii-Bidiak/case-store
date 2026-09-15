import { http, HttpResponse, delay } from "msw";
import { QueryClient } from "@tanstack/react-query";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import {
  getAdminOrderControllerGetAllowedPaymentTransitionsQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  getAdminOrderControllerGetHistoryQueryKey,
} from "@/entities/order";
import { PaymentStatusSelect } from "./payment-status-select";

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const ORDER_ID = "order-uuid-1";

/**
 * The option list comes from the server now (TASK-431), so every test declares
 * what the server says is legal. That is the behaviour under test: before this,
 * the component invented the list from the enum and the server had no say.
 */
function stubTransitions(current: string, allowed: string[]) {
  server.use(
    http.get("*/api/admin/orders/:orderId/allowed-payment-transitions", () =>
      HttpResponse.json({
        data: {
          current,
          allowed,
          updatedAt: "2026-09-14T10:00:00.000Z",
        },
      }),
    ),
  );
}

function stubPatch(status = 200, body?: unknown) {
  server.use(
    http.patch("*/api/admin/orders/:orderId/payment-status", () => {
      if (status !== 200) {
        return HttpResponse.json(body ?? null, { status });
      }
      return HttpResponse.json({
        data: { id: ORDER_ID, status: "PENDING", paymentStatus: "PAID" },
      });
    }),
  );
}

function renderSelect(queryClient?: QueryClient) {
  return renderWithProviders(
    <PaymentStatusSelect orderId={ORDER_ID} />,
    queryClient ? { queryClient } : {},
  );
}

/** A QueryClient whose `invalidateQueries` calls the test can read back. */
function spyingQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return {
    queryClient,
    invalidate: jest.spyOn(queryClient, "invalidateQueries"),
  };
}

const openSelect = async () =>
  userEvent.click(
    await screen.findByRole("combobox", {
      name: dict.orderStatus.paymentUpdateAria,
    }),
  );

describe("PaymentStatusSelect (TASK-151, TASK-431)", () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it("offers exactly the statuses the server calls legal — not every other value", async () => {
    stubTransitions("PENDING", ["PAID", "FAILED"]);
    renderSelect();
    await openSelect();

    expect(
      screen.getByRole("option", { name: "Оплачено" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Помилка оплати" }),
    ).toBeInTheDocument();
    // The old component listed these too, purely because they were not the
    // current value. Neither is reachable from PENDING.
    expect(
      screen.queryByRole("option", { name: "Кошти повернено" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Частково повернуто" }),
    ).not.toBeInTheDocument();
  });

  it("offers a PARTIAL refund but not a full one on a delivered, paid order", async () => {
    stubTransitions("PAID", ["PARTIALLY_REFUNDED"]);
    renderSelect();
    await openSelect();

    expect(
      screen.getByRole("option", { name: "Частково повернуто" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Кошти повернено" }),
    ).not.toBeInTheDocument();
  });

  it("says so, rather than rendering an empty dropdown, when nothing is possible", async () => {
    stubTransitions("REFUNDED", []);
    renderSelect();

    expect(
      await screen.findByText(dict.orderStatus.noPaymentTransitions),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("explains the missing full refund instead of leaving the operator guessing", async () => {
    stubTransitions("PAID", ["PARTIALLY_REFUNDED"]);
    renderSelect();

    expect(
      await screen.findByText(dict.orderStatus.paymentTransitionsHint),
    ).toBeInTheDocument();
  });

  it("shows an error line when the option list cannot be read", async () => {
    server.use(
      http.get(
        "*/api/admin/orders/:orderId/allowed-payment-transitions",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderSelect();

    expect(
      await screen.findByText(dict.orderStatus.paymentTransitionsLoadError),
    ).toBeInTheDocument();
  });

  it("calls the mutation and shows a success toast when a status is picked", async () => {
    stubTransitions("PENDING", ["PAID", "FAILED"]);
    stubPatch(200);
    renderSelect();

    await openSelect();
    await userEvent.click(screen.getByRole("option", { name: "Оплачено" }));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        dict.orderStatus.paymentToastUpdated("Оплачено"),
      ),
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows the generic error toast when the update fails for a non-conflict reason", async () => {
    stubTransitions("PENDING", ["PAID", "FAILED"]);
    stubPatch(500);
    renderSelect();

    await openSelect();
    await userEvent.click(screen.getByRole("option", { name: "Оплачено" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        dict.orderStatus.paymentToastFailed,
      ),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  // ── The two coded 409s (TASK-431) ──────────────────────────────────────────
  // A refused write must say WHICH refusal it was: "that move is impossible" and
  // "cancel the order first" have different next actions.

  it("toasts the coded message for an illegal payment transition", async () => {
    stubTransitions("PENDING", ["PAID", "FAILED"]);
    stubPatch(409, {
      error: "ORDER_PAYMENT_TRANSITION_INVALID",
      message: "Order payment status cannot move from REFUNDED to PAID",
      statusCode: 409,
    });
    renderSelect();

    await openSelect();
    await userEvent.click(screen.getByRole("option", { name: "Оплачено" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        dict.orderStatus.conflict.ORDER_PAYMENT_TRANSITION_INVALID,
      ),
    );
  });

  it("toasts the cross-rule message when a full refund needs the order closed first", async () => {
    stubTransitions("PAID", ["PARTIALLY_REFUNDED", "REFUNDED"]);
    stubPatch(409, {
      error: "ORDER_REFUND_REQUIRES_CLOSED_ORDER",
      message: "A full refund needs the order cancelled or refunded first",
      statusCode: 409,
    });
    renderSelect();

    await openSelect();
    await userEvent.click(
      screen.getByRole("option", { name: "Кошти повернено" }),
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        dict.orderStatus.conflict.ORDER_REFUND_REQUIRES_CLOSED_ORDER,
      ),
    );
  });

  it("refetches its own option list after a refusal, so the stale choice disappears", async () => {
    stubTransitions("PENDING", ["PAID", "FAILED"]);
    stubPatch(409, { error: "ORDER_PAYMENT_TRANSITION_INVALID" });
    const { queryClient, invalidate } = spyingQueryClient();
    renderSelect(queryClient);

    await openSelect();
    await userEvent.click(screen.getByRole("option", { name: "Оплачено" }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey:
          getAdminOrderControllerGetAllowedPaymentTransitionsQueryKey(ORDER_ID),
      }),
    );
  });

  it("disables the trigger while the mutation is in flight", async () => {
    stubTransitions("PENDING", ["PAID", "FAILED"]);
    server.use(
      http.patch("*/api/admin/orders/:orderId/payment-status", async () => {
        await delay(100);
        return HttpResponse.json({
          data: { id: ORDER_ID, status: "PENDING", paymentStatus: "PAID" },
        });
      }),
    );
    renderSelect();

    await openSelect();
    await userEvent.click(screen.getByRole("option", { name: "Оплачено" }));

    expect(
      screen.getByRole("combobox", {
        name: dict.orderStatus.paymentUpdateAria,
      }),
    ).toBeDisabled();
  });

  // TASK-400. The bug this pins was invisible in this component: marking an
  // order paid succeeded, and the damage only showed up on the NEXT action, in
  // a different control. The status picker sends back the `updatedAt` it read
  // from the allowed-transitions query as an optimistic-lock token; a payment
  // write bumps `updatedAt`, so leaving that query cached made the picker
  // present a token the server had already superseded, and the server refused
  // the move as stale. The operator, alone in one tab, was told somebody else
  // had just changed the order.
  it("invalidates the allowed-transitions key, so the next status change is not refused as stale", async () => {
    stubTransitions("PENDING", ["PAID", "FAILED"]);
    stubPatch(200);
    const { queryClient, invalidate } = spyingQueryClient();
    renderSelect(queryClient);

    await openSelect();
    await userEvent.click(screen.getByRole("option", { name: "Оплачено" }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey:
          getAdminOrderControllerGetAllowedTransitionsQueryKey(ORDER_ID),
      }),
    );
  });

  it("invalidates the history key, because the write adds a PAYMENT_STATUS audit row", async () => {
    stubTransitions("PENDING", ["PAID", "FAILED"]);
    stubPatch(200);
    const { queryClient, invalidate } = spyingQueryClient();
    renderSelect(queryClient);

    await openSelect();
    await userEvent.click(screen.getByRole("option", { name: "Оплачено" }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: getAdminOrderControllerGetHistoryQueryKey(ORDER_ID),
      }),
    );
  });
});
