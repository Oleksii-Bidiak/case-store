import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import {
  orderStatusLabel,
  useAdminOrderMoneyControllerGet,
} from "@/entities/order";
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

/**
 * Render the picker inside a session context — it asks `can('orders:write')`
 * before drawing anything, so there has to be a session to ask.
 */
function renderSelect(
  options: {
    permissions?: string[];
    isOwner?: boolean;
  } = {},
) {
  const {
    permissions = ["orders:write", "returns:read", "returns:write"],
    isOwner = false,
  } = options;
  return renderWithProviders(
    <WithAuth isOwner={isOwner} permissions={permissions}>
      <OrderStatusSelect orderId={ORDER_ID} />
    </WithAuth>,
  );
}

beforeEach(() => {
  stubOrder();
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
    await screen.findByRole("button", { name: dict.orders.updateStatus }),
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
      await screen.findByRole("menuitem", {
        name: orderStatusLabel("DELIVERED"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: orderStatusLabel("CANCELLED") }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: orderStatusLabel("REFUNDED") }),
    ).toBeInTheDocument();

    // Backwards moves the state machine forbids are absent from the DOM — the
    // operator cannot pick them and then be told no.
    expect(
      screen.queryByRole("menuitem", { name: orderStatusLabel("PENDING") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: orderStatusLabel("CONFIRMED") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: orderStatusLabel("PROCESSING") }),
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
      await screen.findByRole("menuitem", {
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
      screen.queryByRole("button", { name: dict.orders.updateStatus }),
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
      await screen.findByRole("menuitem", {
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
      await screen.findByRole("menuitem", {
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

  it("names the exhausted promo code when a revive is refused (AD-ORD-51)", async () => {
    stubOrder({ status: "CANCELLED" });
    stubTransitions(["PENDING"]);
    stubStatusPatch(() =>
      HttpResponse.json(
        {
          statusCode: 409,
          error: "DISCOUNT_MAX_REDEMPTIONS_REACHED",
          message:
            'Promo code "SALE1" has reached its redemption limit — cannot revive the order',
        },
        { status: 409 },
      ),
    );

    renderSelect();
    await openPicker();
    await userEvent.click(
      await screen.findByRole("menuitem", {
        name: orderStatusLabel("PENDING"),
      }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      dict.orderStatus.conflict.DISCOUNT_MAX_REDEMPTIONS_REACHED,
    );
    expect(alert).not.toHaveTextContent(dict.orderStatus.conflictUnknown);
    expect(alert).not.toHaveTextContent("redemption limit");
    // Reloading would show the same order and the same refusal.
    expect(
      screen.queryByRole("button", { name: dict.orderStatus.reloadCta }),
    ).not.toBeInTheDocument();
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
      await screen.findByRole("menuitem", {
        name: orderStatusLabel("SHIPPED"),
      }),
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
    // TASK-788: the confirmation travels with the write.
    expect(patch.bodies[0]).toMatchObject({
      status: "SHIPPED",
      confirmUnpaidShipment: true,
    });
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
    // No dialog, no confirmation to send (TASK-788).
    expect(patch.bodies[0]).not.toHaveProperty("confirmUnpaidShipment");
  });
});

/**
 * R2 (TASK-1969) — REFUNDED is derived, never picked.
 *
 * The server sets it when the payouts on the order's returns cover the goods
 * that came back (and takes it back when a payout is reversed); the
 * allowed-transitions answer never lists it. The menu does not name it either —
 * not as a move and not under «Недоступно зараз» — and the «Повернення коштів
 * без заявки?» dialog (TASK-469 → TASK-1963) is gone with it, together with
 * the returns lookup that fed it.
 */
describe("OrderStatusSelect — REFUNDED is not a manual move (TASK-1969)", () => {
  it("lists REFUNDED nowhere in the menu of a shipped order", async () => {
    stubTransitions(["DELIVERED", "CANCELLED"]);

    renderSelect();
    await openPicker();

    expect(
      await screen.findByRole("group", { name: dict.orderStatus.menuAllowed }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", {
        name: new RegExp(orderStatusLabel("REFUNDED")),
      }),
    ).not.toBeInTheDocument();
  });

  it("still names REFUNDED as the current status, with no move out of it", async () => {
    stubOrder({ status: "REFUNDED", paymentStatus: "REFUNDED" });
    server.use(
      http.get("*/api/admin/orders/:orderId/allowed-transitions", () =>
        HttpResponse.json({
          data: {
            current: "REFUNDED",
            allowed: [],
            updatedAt: "2026-06-01T10:00:00.000Z",
          },
        }),
      ),
    );

    renderSelect();

    expect(
      await screen.findByText(dict.orderStatus.noTransitions),
    ).toBeInTheDocument();
  });

  it("no longer reads the order's returns", async () => {
    stubTransitions(["DELIVERED"]);
    let lookups = 0;
    server.use(
      http.get("*/api/admin/orders/:orderId/returns", () => {
        lookups += 1;
        return HttpResponse.json({ data: [] });
      }),
    );

    renderSelect();
    await openPicker();
    await screen.findByRole("group", { name: dict.orderStatus.menuAllowed });

    expect(lookups).toBe(0);
  });
});

/**
 * TASK-715 — `PATCH /admin/orders/:id/status` needs `orders:write`. A reader got
 * the picker, and every move came back as a 403 reported as "somebody else
 * changed this order" (AD-ORD-34). The picker is now absent for them.
 */
describe("OrderStatusSelect — orders:write gate (TASK-715)", () => {
  it("renders nothing for a session that may only read orders", () => {
    stubTransitions(["DELIVERED"]);

    const { container } = renderSelect({ permissions: ["orders:read"] });

    expect(
      screen.queryByRole("button", { name: dict.orders.updateStatus }),
    ).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the picker for a session holding orders:write", async () => {
    stubTransitions(["DELIVERED"]);

    renderSelect({ permissions: ["orders:read", "orders:write"] });

    expect(
      await screen.findByRole("button", { name: dict.orders.updateStatus }),
    ).toBeInTheDocument();
  });
});

/**
 * Wave 198 (TASK-1046, К1/К2): the picker is a menu-button — «Зараз: …», the
 * moves the server allows, the rest under «Недоступно зараз» with a reason —
 * and the natural next step is the primary button. Both run the same write.
 */
describe("OrderStatusSelect — menu-button and next step (TASK-1046)", () => {
  it("shows the current status, the allowed moves, and the rest as unavailable with a reason", async () => {
    stubOrder({ status: "CONFIRMED" });
    server.use(
      http.get("*/api/admin/orders/:orderId/allowed-transitions", () =>
        HttpResponse.json({
          data: {
            current: "CONFIRMED",
            allowed: ["PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"],
            updatedAt: "2026-06-01T10:00:00.000Z",
          },
        }),
      ),
    );
    renderSelect();
    await openPicker();

    expect(
      await screen.findByText(
        dict.orderStatus.menuCurrent(orderStatusLabel("CONFIRMED")),
      ),
    ).toBeInTheDocument();
    const allowed = within(
      screen.getByRole("group", { name: dict.orderStatus.menuAllowed }),
    );
    expect(
      allowed.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["В обробці", "Відправлено", "Доставлено", "Скасовано"]);

    const unavailable = within(
      screen.getByRole("group", { name: dict.orderStatus.menuUnavailable }),
    );
    const back = unavailable.getByRole("menuitem", {
      name: new RegExp(orderStatusLabel("PENDING")),
    });
    expect(back).toHaveAttribute("aria-disabled", "true");
    expect(back).toHaveTextContent(dict.orderStatus.reasonNoWayBack);
    // REFUNDED is set by the ledger, not picked — not even listed (TASK-1969).
    expect(
      unavailable.queryByRole("menuitem", {
        name: new RegExp(orderStatusLabel("REFUNDED")),
      }),
    ).not.toBeInTheDocument();
  });

  it("offers «Відправити» as the primary step and asks about an unpaid online order first", async () => {
    stubOrder({
      status: "CONFIRMED",
      paymentMethod: "ONLINE",
      paymentStatus: "PENDING",
    });
    server.use(
      http.get("*/api/admin/orders/:orderId/allowed-transitions", () =>
        HttpResponse.json({
          data: {
            current: "CONFIRMED",
            allowed: ["PROCESSING", "SHIPPED", "CANCELLED"],
            updatedAt: "2026-06-01T10:00:00.000Z",
          },
        }),
      ),
    );
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );
    renderSelect();

    await userEvent.click(
      await screen.findByRole("button", { name: dict.orderStatus.nextShip }),
    );

    // The same speed bump as picking «Відправлено» from the menu (TASK-468).
    expect(
      await screen.findByText(dict.orderStatus.unpaidShipTitle),
    ).toBeInTheDocument();
    expect(patch.bodies).toHaveLength(0);
  });

  it("writes the next step straight away when there is nothing to ask", async () => {
    stubOrder({ status: "SHIPPED" });
    stubTransitions(["DELIVERED", "CANCELLED", "REFUNDED"]);
    const patch = stubStatusPatch(() =>
      HttpResponse.json({ data: { id: ORDER_ID } }),
    );
    renderSelect();

    await userEvent.click(
      await screen.findByRole("button", { name: dict.orderStatus.nextDeliver }),
    );

    await waitFor(() => expect(patch.bodies).toHaveLength(1));
    expect(patch.bodies[0]).toMatchObject({ status: "DELIVERED" });
  });

  it("offers no primary step the server does not allow", async () => {
    stubTransitions(["CANCELLED"]);
    renderSelect();

    await screen.findByRole("button", { name: dict.orders.updateStatus });
    expect(
      screen.queryByRole("button", { name: dict.orderStatus.nextDeliver }),
    ).not.toBeInTheDocument();
  });
});

/**
 * TASK-842 → R2: what the «Оплата» block offers depends on the ORDER status —
 * cancelling a paid order is exactly what unlocks «Повернути гроші» without a
 * return (`outWithoutReturnMaxKop`), and the status write moves the lock token
 * the block sends back. The Orval keys are flat strings, so invalidating the
 * order itself does not reach the money query by prefix; this pins the explicit
 * invalidation. The probe reads the same entity hook the block reads, so no
 * feature imports another.
 */
function MoneyProbe({ orderId }: { orderId: string }) {
  const { data } = useAdminOrderMoneyControllerGet(orderId);
  return <p data-testid="money-out-max">{data?.data.outWithoutReturnMaxKop}</p>;
}

describe("OrderStatusSelect — the money block follows the order (TASK-842, R2)", () => {
  it("refetches the order's money after cancelling, so the payout appears", async () => {
    stubTransitions(["CANCELLED"]);
    let cancelled = false;
    let moneyReads = 0;
    server.use(
      http.get("*/api/admin/orders/:orderId/money", () => {
        moneyReads += 1;
        return HttpResponse.json({
          data: { outWithoutReturnMaxKop: cancelled ? 129900 : 0 },
        });
      }),
    );
    stubStatusPatch(() => {
      cancelled = true;
      return HttpResponse.json({ data: { id: ORDER_ID } });
    });

    renderWithProviders(
      <WithAuth permissions={["orders:write", "returns:read", "returns:write"]}>
        <OrderStatusSelect orderId={ORDER_ID} />
        <MoneyProbe orderId={ORDER_ID} />
      </WithAuth>,
    );
    await waitFor(() => expect(moneyReads).toBe(1));
    expect(screen.getByTestId("money-out-max")).toHaveTextContent("0");

    await openPicker();
    await userEvent.click(
      await screen.findByRole("menuitem", {
        name: orderStatusLabel("CANCELLED"),
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("money-out-max")).toHaveTextContent("129900"),
    );
    expect(moneyReads).toBe(2);
  });
});
