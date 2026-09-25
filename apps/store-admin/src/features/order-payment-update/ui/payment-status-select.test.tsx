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

/**
 * TASK-715: the control exists only for a session holding `orders:write`, so
 * every behavioural test renders one. The refusal is its own describe below.
 * TASK-620: the picker also asks `can('payments:correct')` before offering the
 * correction of a mistaken REFUNDED mark, so a test can widen the session.
 */
const WRITER = { permissions: ["orders:read", "orders:write"] };

function renderSelect(
  queryClient?: QueryClient,
  permissions: string[] = WRITER.permissions,
) {
  const auth = { permissions };
  return renderWithProviders(
    <PaymentStatusSelect orderId={ORDER_ID} />,
    queryClient ? { queryClient, auth } : { auth },
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
    expect(
      screen.getByText(dict.orderStatus.paymentTransitionsHintFullRefund),
    ).toBeInTheDocument();
  });

  it("does not tell the operator to cancel when the full refund is already offered", async () => {
    // TASK-842: on a cancelled order REFUNDED is in the list — "cancel first"
    // would be advice about something already done.
    stubTransitions("PARTIALLY_REFUNDED", ["REFUNDED"]);
    renderSelect();

    expect(
      await screen.findByText(dict.orderStatus.paymentTransitionsHint),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.orderStatus.paymentTransitionsHintFullRefund),
    ).not.toBeInTheDocument();
  });

  it("does not mention a refund while no money has arrived", async () => {
    stubTransitions("PENDING", ["PAID", "FAILED"]);
    renderSelect();

    expect(
      await screen.findByText(dict.orderStatus.paymentTransitionsHint),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.orderStatus.paymentTransitionsHintFullRefund),
    ).not.toBeInTheDocument();
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

/**
 * TASK-620 (decision B-11 №7): the correction of a mistaken «Кошти повернено».
 * REFUNDED offers no ordinary move — that stays true — but an operator holding
 * `payments:correct` gets a separate, explained action with a required reason.
 */
describe("PaymentStatusSelect — correcting a mistaken REFUNDED (TASK-620)", () => {
  const CORRECT = ["orders:write", "payments:correct"];

  function stubCorrection(status = 200, body?: unknown) {
    const bodies: unknown[] = [];
    server.use(
      http.post(
        "*/api/admin/orders/:orderId/payment-correction",
        async ({ request }) => {
          bodies.push(await request.json());
          if (status !== 200) {
            return HttpResponse.json(body ?? null, { status });
          }
          return HttpResponse.json({
            data: { id: ORDER_ID, status: "CANCELLED", paymentStatus: "PAID" },
          });
        },
      ),
    );
    return bodies;
  }

  const openCorrection = async () =>
    userEvent.click(
      await screen.findByRole("button", {
        name: dict.orderStatus.paymentCorrectAction,
      }),
    );

  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it("is not offered without payments:correct", async () => {
    stubTransitions("REFUNDED", []);
    renderSelect(undefined, ["orders:write", "payments:refund"]);

    expect(
      await screen.findByText(dict.orderStatus.noPaymentTransitions),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: dict.orderStatus.paymentCorrectAction,
      }),
    ).not.toBeInTheDocument();
  });

  it("is not offered on a payment that is not REFUNDED", async () => {
    stubTransitions("PAID", ["PARTIALLY_REFUNDED"]);
    renderSelect(undefined, CORRECT);

    await screen.findByRole("combobox", {
      name: dict.orderStatus.paymentUpdateAria,
    });
    expect(
      screen.queryByRole("button", {
        name: dict.orderStatus.paymentCorrectAction,
      }),
    ).not.toBeInTheDocument();
  });

  it("requires a reason, then sends the target and the reason", async () => {
    stubTransitions("REFUNDED", []);
    const bodies = stubCorrection();
    renderSelect(undefined, CORRECT);

    await openCorrection();
    const confirm = screen.getByRole("button", {
      name: dict.orderStatus.paymentCorrectConfirm,
    });
    expect(confirm).toBeDisabled();

    await userEvent.click(
      screen.getByRole("radio", { name: "Частково повернуто" }),
    );
    await userEvent.type(
      screen.getByLabelText(dict.orderStatus.paymentCorrectReason),
      "Помилково натиснула повне повернення",
    );
    await userEvent.click(confirm);

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      paymentStatus: "PARTIALLY_REFUNDED",
      reason: "Помилково натиснула повне повернення",
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it("explains a refusal for a mark the provider reported", async () => {
    stubTransitions("REFUNDED", []);
    stubCorrection(409, {
      error: "ORDER_PAYMENT_CORRECTION_PROVIDER_REFUND",
      message: "x",
      statusCode: 409,
    });
    renderSelect(undefined, CORRECT);

    await openCorrection();
    await userEvent.type(
      screen.getByLabelText(dict.orderStatus.paymentCorrectReason),
      "причина",
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: dict.orderStatus.paymentCorrectConfirm,
      }),
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        dict.orderStatus.conflict.ORDER_PAYMENT_CORRECTION_PROVIDER_REFUND,
      ),
    );
  });
});

/**
 * TASK-715 — `PATCH /admin/orders/:id/payment-status` needs `orders:write`. The
 * picker is not rendered for anyone else (not disabled — absent).
 */
describe("PaymentStatusSelect — without orders:write (TASK-715)", () => {
  it("renders nothing for a session that may only read orders", () => {
    stubTransitions("PAID", ["PARTIALLY_REFUNDED"]);

    const { container } = renderWithProviders(
      <PaymentStatusSelect orderId={ORDER_ID} />,
      { auth: { permissions: ["orders:read"] } },
    );

    expect(
      screen.queryByRole("combobox", {
        name: dict.orderStatus.paymentUpdateAria,
      }),
    ).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the picker for a session holding orders:write", async () => {
    stubTransitions("PAID", ["PARTIALLY_REFUNDED"]);

    renderSelect();

    expect(
      await screen.findByRole("combobox", {
        name: dict.orderStatus.paymentUpdateAria,
      }),
    ).toBeInTheDocument();
  });
});

/**
 * TASK-842 (AD-ORD-35) — an empty picker used to be one grey line and nothing
 * else. On a refunded order, or one showing «Частково повернуто 0 грн з N», the
 * operator had no idea why the control was gone or what to do next.
 */
describe("PaymentStatusSelect — why nothing can change, and what next (TASK-842)", () => {
  const RETURNS_READER = {
    permissions: ["orders:read", "orders:write", "returns:read"],
  };
  const renderAs = (auth: { permissions: string[] }) =>
    renderWithProviders(<PaymentStatusSelect orderId={ORDER_ID} />, { auth });
  const returnsLink = () =>
    screen.queryByRole("link", {
      name: dict.orderStatus.noPaymentTransitionsReturnsLink,
    });

  it("explains a full refund as the end state and links to the order's returns", async () => {
    // Cancelled order, money fully returned: REFUNDED has no onward move.
    stubTransitions("REFUNDED", []);
    renderAs(RETURNS_READER);

    expect(
      await screen.findByText(dict.orderStatus.noPaymentTransitionsRefunded),
    ).toBeInTheDocument();
    expect(returnsLink()).toHaveAttribute("href", "/returns?search=order-uu");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("on a live order «Частково повернуто 0 грн» says to close the order first and where the sum comes from", async () => {
    // The server drops REFUNDED while the order is not cancelled/refunded, so
    // PARTIALLY_REFUNDED is left with nothing.
    stubTransitions("PARTIALLY_REFUNDED", []);
    renderAs(RETURNS_READER);

    expect(
      await screen.findByText(dict.orderStatus.noPaymentTransitionsPartial),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.orderStatus.noPaymentTransitionsPartialAmount),
    ).toBeInTheDocument();
    expect(returnsLink()).toHaveAttribute("href", "/returns?search=order-uu");
  });

  it("gives the pointer as text, not a link, without returns:read", async () => {
    stubTransitions("PARTIALLY_REFUNDED", []);
    renderAs(WRITER);

    expect(
      await screen.findByText(dict.orderStatus.noPaymentTransitionsPartial),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.orderStatus.noPaymentTransitionsReturnsNoAccess),
    ).toBeInTheDocument();
    expect(returnsLink()).not.toBeInTheDocument();
  });

  it("on a cancelled, partly refunded order offers the full refund instead of a dead end", async () => {
    // Order CANCELLED → the cross-rule lets REFUNDED through.
    stubTransitions("PARTIALLY_REFUNDED", ["REFUNDED"]);
    renderAs(RETURNS_READER);
    await openSelect();

    expect(
      screen.getByRole("option", { name: "Кошти повернено" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.orderStatus.noPaymentTransitions),
    ).not.toBeInTheDocument();
  });
});
