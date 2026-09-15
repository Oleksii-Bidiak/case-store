import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import { orderStatusLabel } from "@/entities/order";
import { OrderStatusSelect } from "./order-status-select";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const ORDER_ID = "order-uuid-12345678";

/**
 * The order the control now reads for itself (TASK-468 / TASK-469): the picker
 * needs to know HOW the order is being paid for and WHAT is on it before it can
 * decide whether a move deserves a question.
 *
 * The default is the boring order — cash on delivery, already paid — so every
 * pre-existing test in this file goes on asserting the plain path.
 */
function stubOrder(
  overrides: Partial<{
    status: string;
    paymentMethod: string;
    paymentStatus: string;
    total: string;
  }> = {},
) {
  server.use(
    http.get("*/api/admin/orders/:orderId", () =>
      HttpResponse.json({
        data: {
          id: ORDER_ID,
          status: overrides.status ?? "SHIPPED",
          paymentStatus: overrides.paymentStatus ?? "PAID",
          paymentMethod: overrides.paymentMethod ?? "ON_DELIVERY",
          total: overrides.total ?? "1498.00",
          items: [
            {
              id: "line-1",
              productId: "product-1",
              productName: "Чохол",
              quantity: 2,
              price: "749.00",
              lineTotal: "1498.00",
              addons: [],
            },
          ],
        },
      }),
    ),
  );
}

/** Stub "which returns already exist on this order" (TASK-469). */
function stubOrderReturns(count: number) {
  server.use(
    http.get("*/api/admin/orders/:orderId/returns", () =>
      HttpResponse.json({
        data: Array.from({ length: count }, (_, index) => ({
          id: `return-${index}`,
          orderId: ORDER_ID,
          status: "REQUESTED",
          reason: null,
          requestedAt: "2026-09-01T10:00:00.000Z",
          resolvedAt: null,
          restockedAt: null,
          refundedAmount: null,
          items: [],
        })),
      }),
    ),
  );
}

/**
 * Render the picker inside a session context — it asks `can('returns:write')`
 * before offering to open a return, so there has to be a session to ask.
 */
function renderSelect(
  options: { permissions?: string[]; isOwner?: boolean } = {},
) {
  const { permissions = ["orders:write", "returns:write"], isOwner = false } =
    options;
  return renderWithProviders(
    <WithAuth isOwner={isOwner} permissions={permissions}>
      <OrderStatusSelect orderId={ORDER_ID} />
    </WithAuth>,
  );
}

beforeEach(() => {
  stubOrder();
  // Default: the order already carries a return, so REFUNDED asks nothing. The
  // "no return yet" case is set up explicitly by the tests that are about it.
  stubOrderReturns(1);
});

/** Stub the allowed-transitions read with a specific server answer. */
function stubTransitions(
  allowed: string[],
  updatedAt = "2026-06-01T10:00:00.000Z",
) {
  server.use(
    http.get("*/api/admin/orders/:orderId/allowed-transitions", () =>
      HttpResponse.json({
        data: { current: "SHIPPED", allowed, updatedAt },
      }),
    ),
  );
}

/** Stub the status PATCH, capturing what the client actually sent. */
function stubStatusPatch(respond: () => Response): {
  bodies: Array<Record<string, unknown>>;
} {
  const bodies: Array<Record<string, unknown>> = [];
  server.use(
    http.patch("*/api/admin/orders/:orderId/status", async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return respond();
    }),
  );
  return { bodies };
}

const openPicker = async () =>
  userEvent.click(
    await screen.findByRole("combobox", { name: dict.orderStatus.updateAria }),
  );

describe("OrderStatusSelect — server-driven options (TASK-332)", () => {
  it("offers exactly the statuses the server allows, and nothing else", async () => {
    // A SHIPPED order can only move on, be cancelled, or be refunded. The
    // pre-TASK-332 control offered all six other statuses; this asserts the
    // shortened list, which is the whole point of the change.
    stubTransitions(["DELIVERED", "CANCELLED", "REFUNDED"]);

    renderSelect();
    await openPicker();

    expect(
      await screen.findByRole("option", {
        name: orderStatusLabel("DELIVERED"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: orderStatusLabel("CANCELLED") }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: orderStatusLabel("REFUNDED") }),
    ).toBeInTheDocument();

    // Backwards moves the state machine forbids are absent from the DOM — the
    // operator cannot pick them and then be told no.
    expect(
      screen.queryByRole("option", { name: orderStatusLabel("PENDING") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: orderStatusLabel("CONFIRMED") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: orderStatusLabel("PROCESSING") }),
    ).not.toBeInTheDocument();
  });

  it("sends the server's own updatedAt back as the optimistic-lock token", async () => {
    stubTransitions(["DELIVERED"], "2026-07-28T10:15:30.000Z");
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );

    renderSelect();
    await openPicker();
    await userEvent.click(
      await screen.findByRole("option", {
        name: orderStatusLabel("DELIVERED"),
      }),
    );

    await waitFor(() => expect(patch.bodies).toHaveLength(1));
    expect(patch.bodies[0]).toEqual({
      status: "DELIVERED",
      expectedUpdatedAt: "2026-07-28T10:15:30.000Z",
    });
  });

  it("renders no picker at all when the server allows no move", async () => {
    stubTransitions([]);

    renderSelect();

    expect(
      await screen.findByText(dict.orderStatus.noTransitions),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: dict.orderStatus.updateAria }),
    ).not.toBeInTheDocument();
  });

  it("says the options could not be read instead of showing an empty picker", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId/allowed-transitions", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    renderSelect();

    expect(
      await screen.findByText(dict.orderStatus.transitionsLoadError),
    ).toBeInTheDocument();
  });
});

describe("OrderStatusSelect — 409 conflicts (TASK-332, edge case E-11)", () => {
  it("tells the operator someone else changed the order, and offers a reload", async () => {
    stubTransitions(["DELIVERED"]);
    stubStatusPatch(() =>
      HttpResponse.json(
        { statusCode: 409, error: "ORDER_STALE", message: "changed" },
        { status: 409 },
      ),
    );

    renderSelect();
    await openPicker();
    await userEvent.click(
      await screen.findByRole("option", {
        name: orderStatusLabel("DELIVERED"),
      }),
    );

    // The notice is a persistent live region, not only a toast: "your change did
    // not save" must not disappear after four seconds.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(dict.orderStatus.conflict.ORDER_STALE);
    expect(
      screen.getByRole("button", { name: dict.orderStatus.reloadCta }),
    ).toBeInTheDocument();
  });

  it("explains a forbidden transition without telling the operator to reload", async () => {
    stubTransitions(["DELIVERED"]);
    stubStatusPatch(() =>
      HttpResponse.json(
        {
          statusCode: 409,
          error: "ORDER_TRANSITION_INVALID",
          message: "Order status cannot move from SHIPPED to PENDING",
        },
        { status: 409 },
      ),
    );

    renderSelect();
    await openPicker();
    await userEvent.click(
      await screen.findByRole("option", {
        name: orderStatusLabel("DELIVERED"),
      }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      dict.orderStatus.conflict.ORDER_TRANSITION_INVALID,
    );
    // The picker refetches its own options, so a page reload is not the remedy.
    expect(
      screen.queryByRole("button", { name: dict.orderStatus.reloadCta }),
    ).not.toBeInTheDocument();
    // And the backend's English prose never reaches the operator.
    expect(alert).not.toHaveTextContent("cannot move from");
  });
});

/**
 * TASK-468 — «оплату не підтверджено — відправляти?»
 *
 * The owner's rule for this wave: hard-refuse only the physically impossible,
 * make everything else visible. Shipping an unpaid online order is legitimate
 * (a bank transfer by hand, a late callback), so the warning must be a speed
 * bump the operator can walk past — and it must not appear where it would be
 * wrong, because a warning that is routinely wrong trains people to click past
 * the one that is right.
 */
describe("OrderStatusSelect — shipping an unpaid online order (TASK-468)", () => {
  const pickShipped = async () => {
    await openPicker();
    await userEvent.click(
      await screen.findByRole("option", { name: orderStatusLabel("SHIPPED") }),
    );
  };

  it("asks before shipping an ONLINE order whose payment has not arrived", async () => {
    stubTransitions(["SHIPPED"]);
    stubOrder({
      paymentMethod: "ONLINE",
      paymentStatus: "PENDING",
      total: "1498.00",
    });
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );

    renderSelect();
    await pickShipped();

    expect(
      await screen.findByText(dict.orderStatus.unpaidShipTitle),
    ).toBeInTheDocument();
    // Nothing has been written while the question is on screen.
    expect(patch.bodies).toHaveLength(0);
  });

  it("ships anyway once the operator says so", async () => {
    stubTransitions(["SHIPPED"]);
    stubOrder({ paymentMethod: "ONLINE", paymentStatus: "PENDING" });
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );

    renderSelect();
    await pickShipped();
    await userEvent.click(
      await screen.findByRole("button", {
        name: dict.orderStatus.unpaidShipConfirm,
      }),
    );

    await waitFor(() => expect(patch.bodies).toHaveLength(1));
    expect(patch.bodies[0]).toMatchObject({ status: "SHIPPED" });
  });

  it("writes nothing when the operator backs out", async () => {
    stubTransitions(["SHIPPED"]);
    stubOrder({ paymentMethod: "ONLINE", paymentStatus: "PENDING" });
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );

    renderSelect();
    await pickShipped();
    await userEvent.click(
      await screen.findByRole("button", {
        name: dict.orderStatus.unpaidShipCancel,
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText(dict.orderStatus.unpaidShipTitle),
      ).not.toBeInTheDocument(),
    );
    expect(patch.bodies).toHaveLength(0);
  });

  it("says nothing on cash on delivery — unpaid in transit IS the method", async () => {
    stubTransitions(["SHIPPED"]);
    stubOrder({ paymentMethod: "ON_DELIVERY", paymentStatus: "PENDING" });
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );

    renderSelect();
    await pickShipped();

    await waitFor(() => expect(patch.bodies).toHaveLength(1));
    expect(
      screen.queryByText(dict.orderStatus.unpaidShipTitle),
    ).not.toBeInTheDocument();
  });

  it("says nothing once the money is in", async () => {
    stubTransitions(["SHIPPED"]);
    stubOrder({ paymentMethod: "ONLINE", paymentStatus: "PAID" });
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );

    renderSelect();
    await pickShipped();

    await waitFor(() => expect(patch.bodies).toHaveLength(1));
    expect(
      screen.queryByText(dict.orderStatus.unpaidShipTitle),
    ).not.toBeInTheDocument();
  });
});

/**
 * TASK-469 — «створити заявку на все замовлення?»
 *
 * `Return` is the source of truth about a return; `OrderStatus.REFUNDED` is a
 * derived label. Setting the label with no record behind it is edge case E-12: a
 * refund with no lines, no quantities and no stock movement. The dialog closes
 * that hole — and deliberately does not block, because plenty of refunds have no
 * returning goods at all (a duplicate charge, a goodwill gesture), and forcing a
 * record for those would credit stock the shop never got back.
 */
describe("OrderStatusSelect — refunding with no return on file (TASK-469)", () => {
  const pickRefunded = async () => {
    await openPicker();
    await userEvent.click(
      await screen.findByRole("option", { name: orderStatusLabel("REFUNDED") }),
    );
  };

  function stubCreateReturn(respond: () => Response): {
    bodies: Array<Record<string, unknown>>;
  } {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post("*/api/admin/orders/:orderId/returns", async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return respond();
      }),
    );
    return { bodies };
  }

  it("offers to open one, prefilled with the whole order", async () => {
    stubTransitions(["REFUNDED"]);
    stubOrderReturns(0);
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );

    renderSelect();
    await pickRefunded();

    expect(
      await screen.findByText(dict.returns.createDialogTitle),
    ).toBeInTheDocument();
    // The lines are shown with their quantities, because "the whole order" is a
    // claim the operator has to be able to check before agreeing to it.
    expect(screen.getByText(/Чохол/)).toBeInTheDocument();
    expect(patch.bodies).toHaveLength(0);
  });

  it("opens the return on every line, then moves the order", async () => {
    stubTransitions(["REFUNDED"]);
    stubOrderReturns(0);
    const post = stubCreateReturn(() =>
      HttpResponse.json({ data: { id: "return-new" } }, { status: 201 }),
    );
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );

    renderSelect();
    await pickRefunded();
    await userEvent.click(
      await screen.findByRole("button", {
        name: dict.returns.createDialogSubmit,
      }),
    );

    await waitFor(() => expect(post.bodies).toHaveLength(1));
    expect(post.bodies[0]).toMatchObject({
      items: [{ orderItemId: "line-1", quantity: 2 }],
    });
    // The label follows the record, never the other way round.
    await waitFor(() => expect(patch.bodies).toHaveLength(1));
    expect(patch.bodies[0]).toMatchObject({ status: "REFUNDED" });
  });

  it("leaves the order where it is when the return itself is refused", async () => {
    stubTransitions(["REFUNDED"]);
    stubOrderReturns(0);
    stubCreateReturn(() =>
      HttpResponse.json({ message: "nope" }, { status: 400 }),
    );
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );

    renderSelect();
    await pickRefunded();
    await userEvent.click(
      await screen.findByRole("button", {
        name: dict.returns.createDialogSubmit,
      }),
    );

    // "Refund with a record" is what was asked for; half of it is the empty
    // label this dialog exists to prevent.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: dict.returns.createDialogSubmit }),
      ).toBeInTheDocument(),
    );
    expect(patch.bodies).toHaveLength(0);
  });

  it("does not block — «лише змінити статус» is a real answer", async () => {
    stubTransitions(["REFUNDED"]);
    stubOrderReturns(0);
    const post = stubCreateReturn(() =>
      HttpResponse.json({ data: {} }, { status: 201 }),
    );
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );

    renderSelect();
    await pickRefunded();
    await userEvent.click(
      await screen.findByRole("button", {
        name: dict.returns.createDialogSkip,
      }),
    );

    await waitFor(() => expect(patch.bodies).toHaveLength(1));
    expect(patch.bodies[0]).toMatchObject({ status: "REFUNDED" });
    expect(post.bodies).toHaveLength(0);
  });

  it("asks nothing on a CANCELLED order, where the server would refuse the return", async () => {
    // `ORDER_TRANSITIONS[CANCELLED]` contains REFUNDED — refunding a cancelled
    // order is the ordinary path, not an exotic one. But
    // `RETURNABLE_ORDER_STATUSES` is {SHIPPED, DELIVERED}, so «Створити заявку»
    // could only ever answer 400 and leave the operator in an open dialog with
    // no hint that the secondary button is the working one (review of plan 180).
    stubOrder({ status: "CANCELLED" });
    stubTransitions(["REFUNDED"]);
    stubOrderReturns(0);
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );

    renderSelect();
    await pickRefunded();

    // Straight through: the status moves and no dialog appears.
    await waitFor(() => expect(patch.bodies).toHaveLength(1));
    expect(patch.bodies[0]).toMatchObject({ status: "REFUNDED" });
    expect(
      screen.queryByText(dict.returns.createDialogTitle),
    ).not.toBeInTheDocument();
  });

  it("still asks on a DELIVERED order — the case the dialog was built for", async () => {
    stubOrder({ status: "DELIVERED" });
    stubTransitions(["REFUNDED"]);
    stubOrderReturns(0);
    stubStatusPatch(() => HttpResponse.json({ data: { id: ORDER_ID } }));

    renderSelect();
    await pickRefunded();

    expect(
      await screen.findByText(dict.returns.createDialogTitle),
    ).toBeInTheDocument();
  });

  it("asks nothing when the order already carries a return", async () => {
    stubTransitions(["REFUNDED"]);
    stubOrderReturns(1);
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );

    renderSelect();
    await pickRefunded();

    await waitFor(() => expect(patch.bodies).toHaveLength(1));
    expect(
      screen.queryByText(dict.returns.createDialogTitle),
    ).not.toBeInTheDocument();
  });

  it("asks nothing of an operator who could not open one anyway", async () => {
    stubTransitions(["REFUNDED"]);
    stubOrderReturns(0);
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );

    // No `returns:write`: the dialog would have nothing to offer but a 403.
    renderSelect({ permissions: ["orders:write"] });
    await pickRefunded();

    await waitFor(() => expect(patch.bodies).toHaveLength(1));
    expect(
      screen.queryByText(dict.returns.createDialogTitle),
    ).not.toBeInTheDocument();
  });
});
