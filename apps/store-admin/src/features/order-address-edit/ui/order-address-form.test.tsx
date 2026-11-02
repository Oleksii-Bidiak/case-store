import { http, HttpResponse } from "msw";
import { toast as sonnerToast } from "sonner";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import {
  useAdminOrderControllerFindById,
  type OrderEntity,
} from "@/entities/order";
import { OrderAddressForm } from "./order-address-form";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

/** Only what the control reads: the id, the lock token, status and address. */
function makeOrder(status: string): OrderEntity {
  return {
    id: "order-uuid-1",
    status,
    updatedAt: "2026-06-01T10:00:00.000Z",
    shippingAddress: {
      firstName: "Olena",
      lastName: "Shevchenko",
      city: "Kyiv",
      address1: "Khreshchatyk 1",
      phone: "+380501234567",
    },
  } as unknown as OrderEntity;
}

/**
 * TASK-715 — «Змінити адресу» writes through `PATCH /admin/orders/:id`, which
 * needs `orders:write`. Without it the button is not rendered at all: the
 * address is already on the card, and the form could only end in a 403.
 */
describe("OrderAddressForm — orders:write gate (TASK-715)", () => {
  it("renders nothing for a session that may only read orders", () => {
    const { container } = renderWithProviders(
      <OrderAddressForm order={makeOrder("PENDING")} />,
      { auth: { permissions: ["orders:read"] } },
    );

    expect(
      screen.queryByRole("button", { name: dict.orders.addressEdit }),
    ).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("does not explain a lock the reader could not have used either", () => {
    const { container } = renderWithProviders(
      <OrderAddressForm order={makeOrder("SHIPPED")} />,
      { auth: { permissions: ["orders:read"] } },
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("offers «Змінити адресу» to a session holding orders:write", () => {
    renderWithProviders(<OrderAddressForm order={makeOrder("PENDING")} />, {
      auth: { permissions: ["orders:read", "orders:write"] },
    });

    expect(
      screen.getByRole("button", { name: dict.orders.addressEdit }),
    ).toBeInTheDocument();
  });

  it("still explains the lock to a writer once the parcel has shipped", () => {
    renderWithProviders(<OrderAddressForm order={makeOrder("SHIPPED")} />, {
      auth: { permissions: ["orders:read", "orders:write"] },
    });

    expect(screen.getByText(dict.orders.addressLockedHint)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.orders.addressEdit }),
    ).not.toBeInTheDocument();
  });
});

/**
 * TASK-622: the refusal is read by its STATUS. A 403 used to reach
 * `isOrderConflict` with `error: "Forbidden"` in the body and read as «замовлення
 * змінилося, оновіть сторінку»; a 400 read the same way through `Bad Request`.
 */
describe("OrderAddressForm — refusals (TASK-622)", () => {
  const WRITER = { auth: { permissions: ["orders:read", "orders:write"] } };

  function stubPatch(status: number, error: string) {
    server.use(
      http.patch("*/api/admin/orders/:orderId", () =>
        HttpResponse.json(
          { statusCode: status, error, message: "server prose" },
          { status },
        ),
      ),
    );
  }

  async function submitAddress() {
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressEdit }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressSave }),
    );
  }

  it("says «немає права» under the form on a 403, not «замовлення змінилося»", async () => {
    stubPatch(403, "Forbidden");
    renderWithProviders(
      <OrderAddressForm order={makeOrder("PENDING")} />,
      WRITER,
    );

    await submitAddress();

    expect(
      await screen.findByText(dict.orderStatus.forbidden),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.orderStatus.conflictUnknown),
    ).not.toBeInTheDocument();
  });

  it("does not call a 500 a conflict", async () => {
    stubPatch(500, "Internal Server Error");
    renderWithProviders(
      <OrderAddressForm order={makeOrder("PENDING")} />,
      WRITER,
    );

    await submitAddress();

    // The generic toast fires; nothing on screen claims the order moved.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: dict.orders.addressSave }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByText(dict.orderStatus.conflictUnknown),
    ).not.toBeInTheDocument();
  });

  it("still words a 409 that is not a lost update as the conflict it is", async () => {
    stubPatch(409, "ORDER_TRANSITION_INVALID");
    renderWithProviders(
      <OrderAddressForm order={makeOrder("PENDING")} />,
      WRITER,
    );

    await submitAddress();

    expect(
      await screen.findByText(
        dict.orderStatus.conflict.ORDER_TRANSITION_INVALID,
      ),
    ).toBeInTheDocument();
  });

  it("says to save again — once, inline — when the colleague's version cannot be fetched", async () => {
    (sonnerToast.error as jest.Mock).mockClear();
    stubPatch(409, "ORDER_STALE");
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ statusCode: 500 }, { status: 500 }),
      ),
    );
    renderWithProviders(
      <OrderAddressForm order={makeOrder("PENDING")} />,
      WRITER,
    );

    await submitAddress();

    // «Оновити» is gone, so the line names the step that does work: save again
    // → another 409 → another try at fetching the colleague's version.
    expect(
      await screen.findByText(dict.orderStatus.staleReviewFetchFailed),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.orderStatus.conflict.ORDER_STALE),
    ).not.toBeInTheDocument();
    // One message, not a sticky toast on top of the banner.
    expect(sonnerToast.error).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: dict.orders.addressSave }),
    ).toBeEnabled();
    expect(
      screen.queryByText(dict.orderStatus.staleReviewTitle),
    ).not.toBeInTheDocument();
  });

  it("does not open the review on the next edit when the first was cancelled mid-fetch", async () => {
    stubPatch(409, "ORDER_STALE");
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let fetched = false;
    server.use(
      http.get("*/api/admin/orders/:orderId", async () => {
        fetched = true;
        await gate;
        return HttpResponse.json({
          data: {
            ...makeOrder("PENDING"),
            updatedAt: "2026-06-01T10:00:30.000Z",
            shippingAddress: {
              ...(makeOrder("PENDING").shippingAddress as object),
              city: "Odesa",
            },
          },
        });
      }),
    );
    renderWithProviders(
      <OrderAddressForm order={makeOrder("PENDING")} />,
      WRITER,
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressEdit }),
    );
    const city = screen.getByLabelText(dict.orderCreate.addressCity);
    await userEvent.clear(city);
    await userEvent.type(city, "Lviv");
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressSave }),
    );
    await waitFor(() => expect(fetched).toBe(true));

    // The operator gives up while the colleague's version is still on its way…
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressEditCancel }),
    );
    release();
    // …and it lands after the form closed. The next edit starts clean.
    await userEvent.click(
      await screen.findByRole("button", { name: dict.orders.addressEdit }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(
      screen.queryByText(dict.orderStatus.staleReviewTitle),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.orders.addressSave }),
    ).toBeEnabled();
  });
});

/**
 * TASK-629: the card polls every minute and `keepDirtyValues` keeps a
 * half-typed correction while the `order` prop moves on. The save must carry
 * the version the operator started correcting — sending the refetched one would
 * overwrite a colleague's concurrent edit without a 409.
 */
describe("OrderAddressForm — the lock token under polling (TASK-629)", () => {
  const WRITER = { auth: { permissions: ["orders:read", "orders:write"] } };

  function capturePatch(bodies: Array<Record<string, unknown>>) {
    server.use(
      http.patch("*/api/admin/orders/:orderId", async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({
          data: {
            ...makeOrder("PENDING"),
            updatedAt: "2026-06-01T10:05:00.000Z",
          },
        });
      }),
    );
  }

  function refetched(updatedAt: string): OrderEntity {
    return { ...makeOrder("PENDING"), updatedAt } as OrderEntity;
  }

  it("sends the version the operator started correcting, not one a refetch brought in", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    capturePatch(bodies);
    const { rerender } = renderWithProviders(
      <OrderAddressForm order={makeOrder("PENDING")} />,
      WRITER,
    );

    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressEdit }),
    );
    const city = screen.getByLabelText(dict.orderCreate.addressCity);
    await userEvent.clear(city);
    await userEvent.type(city, "Lviv");
    // A colleague's save arrives with the minute poll.
    rerender(
      <OrderAddressForm order={refetched("2026-06-01T10:00:30.000Z")} />,
    );
    expect(city).toHaveValue("Lviv");
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressSave }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      expectedUpdatedAt: "2026-06-01T10:00:00.000Z",
    });
  });

  it("takes the refreshed version when the refetch lands before any typing", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    capturePatch(bodies);
    const { rerender } = renderWithProviders(
      <OrderAddressForm order={makeOrder("PENDING")} />,
      WRITER,
    );

    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressEdit }),
    );
    rerender(
      <OrderAddressForm order={refetched("2026-06-01T10:00:30.000Z")} />,
    );
    const city = screen.getByLabelText(dict.orderCreate.addressCity);
    await userEvent.clear(city);
    await userEvent.type(city, "Lviv");
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressSave }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      expectedUpdatedAt: "2026-06-01T10:00:30.000Z",
    });
  });

  it("starts the next correction from the version its own save made", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    capturePatch(bodies);
    const { rerender } = renderWithProviders(
      <OrderAddressForm order={makeOrder("PENDING")} />,
      WRITER,
    );

    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressEdit }),
    );
    await userEvent.type(
      screen.getByLabelText(dict.orderCreate.addressCity),
      " (центр)",
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressSave }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    // The detail refetch hands the card its own save back.
    rerender(
      <OrderAddressForm order={refetched("2026-06-01T10:05:00.000Z")} />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: dict.orders.addressEdit }),
    );
    await userEvent.type(
      screen.getByLabelText(dict.orderCreate.addressAddress1),
      ", кв. 2",
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressSave }),
    );

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({
      expectedUpdatedAt: "2026-06-01T10:05:00.000Z",
    });
  });
});

/**
 * TASK-1972 (AD-ORD-105): the same lost update as the notes (AD-ORD-67). After
 * the 409 the form rebased its token onto the refetched version at once and kept
 * the operator's draft, so the second «Зберегти адресу» overwrote the
 * colleague's correction without anyone having seen it. Now the colleague's
 * address is shown field by field next to the draft, and the token moves only
 * when the operator decides.
 */
describe("OrderAddressForm — a colleague saved first (TASK-1972)", () => {
  const WRITER = { auth: { permissions: ["orders:read", "orders:write"] } };
  const V1 = "2026-06-01T10:00:00.000Z";
  const V2 = "2026-06-01T10:00:30.000Z";
  const V3 = "2026-06-01T10:02:00.000Z";

  let serverOrder: OrderEntity;
  let bodies: Array<Record<string, unknown>>;

  beforeEach(() => {
    serverOrder = makeOrder("PENDING");
    bodies = [];
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data: serverOrder }),
      ),
      http.patch("*/api/admin/orders/:orderId", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        if (body.expectedUpdatedAt !== serverOrder.updatedAt) {
          return HttpResponse.json(
            { statusCode: 409, error: "ORDER_STALE", message: "stale" },
            { status: 409 },
          );
        }
        serverOrder = {
          ...serverOrder,
          shippingAddress: body.shippingAddress,
          updatedAt: V3,
        } as OrderEntity;
        return HttpResponse.json({ data: serverOrder });
      }),
    );
  });

  /** The order card's wiring: the form is fed by the polled detail query. */
  function Card() {
    const { data } = useAdminOrderControllerFindById("order-uuid-1");
    return data?.data ? <OrderAddressForm order={data.data} /> : null;
  }

  const saveButton = () =>
    screen.getByRole("button", { name: dict.orders.addressSave });
  // By role: once the review is open, its row is a group named after the field.
  const input = (name: string) => screen.getByRole("textbox", { name });

  /** Tab A corrects the city; tab B saves `colleague` meanwhile; A is refused. */
  async function conflictOn(colleague: Record<string, string>) {
    renderWithProviders(<Card />, WRITER);
    await userEvent.click(
      await screen.findByRole("button", { name: dict.orders.addressEdit }),
    );
    const city = screen.getByLabelText(dict.orderCreate.addressCity);
    await userEvent.clear(city);
    await userEvent.type(city, "Lviv");
    serverOrder = {
      ...serverOrder,
      shippingAddress: { ...serverOrder.shippingAddress, ...colleague },
      updatedAt: V2,
    } as unknown as OrderEntity;
    await userEvent.click(saveButton());
    await waitFor(() => expect(bodies).toHaveLength(1));
  }

  it("shows the colleague's city next to the draft and sends nothing until reviewed", async () => {
    await conflictOn({ city: "Odesa" });

    const row = await screen.findByRole("group", {
      name: dict.orderCreate.addressCity,
    });
    expect(within(row).getByText("Odesa")).toBeInTheDocument();
    expect(input(dict.orderCreate.addressCity)).toHaveValue("Lviv");
    expect(saveButton()).toBeDisabled();
    await userEvent.click(saveButton());
    expect(bodies).toHaveLength(1);
  });

  it("«Переглянув — зберегти мою» sends the draft over the colleague's version", async () => {
    await conflictOn({ city: "Odesa" });

    await userEvent.click(
      await screen.findByRole("button", {
        name: dict.orderStatus.staleReviewKeepMine,
      }),
    );
    await userEvent.click(saveButton());

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[0]).toMatchObject({ expectedUpdatedAt: V1 });
    expect(bodies[1]).toMatchObject({
      expectedUpdatedAt: V2,
      shippingAddress: expect.objectContaining({ city: "Lviv" }),
    });
  });

  it("«Взяти версію колеги» puts the colleague's city in the box", async () => {
    await conflictOn({ city: "Odesa" });

    const row = await screen.findByRole("group", {
      name: dict.orderCreate.addressCity,
    });
    await userEvent.click(
      within(row).getByRole("button", {
        name: dict.orderStatus.staleReviewTakeTheirs,
      }),
    );

    expect(input(dict.orderCreate.addressCity)).toHaveValue("Odesa");
    expect(bodies).toHaveLength(1);
  });

  it("refreshes a field the operator did not touch and waits for «Зрозуміло»", async () => {
    await conflictOn({ phone: "+380671112233" });

    expect(
      await screen.findByText(dict.orderStatus.staleReviewRefreshed),
    ).toBeInTheDocument();
    expect(input(dict.orderCreate.addressPhone)).toHaveValue("+380671112233");
    expect(input(dict.orderCreate.addressCity)).toHaveValue("Lviv");
    expect(saveButton()).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.orderStatus.staleReviewAcknowledge,
      }),
    );
    await userEvent.click(saveButton());

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({
      expectedUpdatedAt: V2,
      shippingAddress: expect.objectContaining({
        city: "Lviv",
        phone: "+380671112233",
      }),
    });
  });
});

/**
 * TASK-577: `123` used to pass the form (`min(1)`), reach the API and come back
 * as a 400 — which the conflict mapper of the day read as «замовлення
 * змінилося». Now the form stops it, under the field, before any request.
 */
describe("OrderAddressForm — phone validation (TASK-577)", () => {
  it("rejects «123» under the phone field and sends nothing", async () => {
    let patched = false;
    server.use(
      http.patch("*/api/admin/orders/:orderId", () => {
        patched = true;
        return HttpResponse.json({ data: {} });
      }),
    );
    renderWithProviders(<OrderAddressForm order={makeOrder("PENDING")} />, {
      auth: { permissions: ["orders:read", "orders:write"] },
    });

    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressEdit }),
    );
    const phone = screen.getByLabelText(dict.orderCreate.addressPhone);
    await userEvent.clear(phone);
    await userEvent.type(phone, "123");
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressSave }),
    );

    expect(
      await screen.findByText(dict.orderCreate.contactPhoneInvalid),
    ).toBeInTheDocument();
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(patched).toBe(false);
    expect(
      screen.queryByText(dict.orderStatus.conflictUnknown),
    ).not.toBeInTheDocument();
  });
});
