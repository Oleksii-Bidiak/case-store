import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { orderStatusLabel } from "@/entities/order";
import { OrderStatusSelect } from "./order-status-select";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const ORDER_ID = "order-uuid-12345678";

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

    renderWithProviders(<OrderStatusSelect orderId={ORDER_ID} />);
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

    renderWithProviders(<OrderStatusSelect orderId={ORDER_ID} />);
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

    renderWithProviders(<OrderStatusSelect orderId={ORDER_ID} />);

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

    renderWithProviders(<OrderStatusSelect orderId={ORDER_ID} />);

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

    renderWithProviders(<OrderStatusSelect orderId={ORDER_ID} />);
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

    renderWithProviders(<OrderStatusSelect orderId={ORDER_ID} />);
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
