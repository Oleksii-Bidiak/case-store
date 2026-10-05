import { http, HttpResponse } from "msw";
import { toast as sonnerToast } from "sonner";
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
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  type OrderEntity,
} from "@/entities/order";
import { OrderDetailsForm } from "./order-details-form";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const ORDER_ID = "order-uuid-1";
const WAYBILL = "59000000000000";

/**
 * Only the four fields this form reads. Standing up a whole `OrderEntity` would
 * add thirty irrelevant properties and hide which ones the behaviour depends on.
 */
const ORDER = {
  id: ORDER_ID,
  updatedAt: "2026-06-01T10:00:00.000Z",
  trackingNumber: null,
  internalNotes: null,
} as unknown as OrderEntity;

/**
 * The same order as it exists in a database that predates the 14-digit rule:
 * TASK-335 let an operator type anything up to 64 characters, and plenty did.
 */
const LEGACY_TRACKING = "ТТН уточнюється";
const LEGACY_ORDER = {
  ...ORDER,
  trackingNumber: LEGACY_TRACKING,
} as unknown as OrderEntity;

/**
 * TASK-715: the editor exists only for a session holding `orders:write`; every
 * behavioural test below renders one. The read-only branch has its own describe.
 */
const WRITER = { permissions: ["orders:read", "orders:write"] };

beforeEach(() => {
  (sonnerToast.error as jest.Mock).mockClear();
  (sonnerToast.success as jest.Mock).mockClear();
});

/** Capture every PATCH body, answering 200 unless a status is given. */
function capturePatch(
  bodies: Array<Record<string, unknown>>,
  response?: { status: number; body: Record<string, unknown> },
) {
  server.use(
    http.patch("*/api/admin/orders/:orderId", async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      if (response) {
        return HttpResponse.json(response.body, { status: response.status });
      }
      return HttpResponse.json({
        data: {
          id: ORDER_ID,
          updatedAt: "2026-06-01T10:05:00.000Z",
          trackingNumber: null,
          internalNotes: "Передзвонити",
        },
      });
    }),
  );
}

/** Stub `PATCH /api/admin/orders/:orderId`, answering with a moved `updatedAt`. */
function stubDetailsPatch() {
  server.use(
    http.patch("*/api/admin/orders/:orderId", () =>
      HttpResponse.json({
        data: {
          id: ORDER_ID,
          updatedAt: "2026-06-01T10:05:00.000Z",
          trackingNumber: WAYBILL,
          internalNotes: null,
        },
      }),
    ),
  );
}

async function saveWaybill() {
  await userEvent.type(
    screen.getByLabelText(dict.orders.trackingNumber),
    WAYBILL,
  );
  await userEvent.click(
    screen.getByRole("button", { name: dict.orders.detailsSave }),
  );
}

describe("OrderDetailsForm — cache invalidation (TASK-400)", () => {
  /**
   * The companion to the payment-status regression: any write that moves
   * `order.updatedAt` invalidates the optimistic-lock token the status picker
   * holds. Saving a waybill is such a write, so the token it refreshes is the
   * one the operator's own next status change will be judged against — without
   * this, a save followed by a status change is refused as stale and reported
   * to a lone operator as a concurrent edit by somebody else.
   */
  it("invalidates the allowed-transitions key, which carries the status picker's lock token", async () => {
    stubDetailsPatch();

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    renderWithProviders(<OrderDetailsForm order={ORDER} />, {
      queryClient,
      auth: WRITER,
    });
    await saveWaybill();

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey:
          getAdminOrderControllerGetAllowedTransitionsQueryKey(ORDER_ID),
      }),
    );
    // The detail query too — it is where the form's own `order.updatedAt` prop
    // comes from, so a second save in a row depends on it being refreshed.
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: getAdminOrderControllerFindByIdQueryKey(ORDER_ID),
    });
  });

  it("sends the lock token it was seeded with", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.patch("*/api/admin/orders/:orderId", async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({
          data: {
            id: ORDER_ID,
            updatedAt: "2026-06-01T10:05:00.000Z",
            trackingNumber: WAYBILL,
            internalNotes: null,
          },
        });
      }),
    );

    renderWithProviders(<OrderDetailsForm order={ORDER} />, { auth: WRITER });
    await saveWaybill();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      trackingNumber: WAYBILL,
      expectedUpdatedAt: ORDER.updatedAt,
    });
  });
});

// ─── The lock token under a polling card (TASK-629) ───────────────────────────

/**
 * The card refetches the order every minute, and `keepDirtyValues` keeps the
 * operator's typing while the `order` prop — and its `updatedAt` — move on. A
 * form that sent the prop's latest `updatedAt` would carry a colleague's token
 * with the operator's text, and the colleague's note would be overwritten with
 * no 409. The token is the one the operator started editing.
 */
describe("OrderDetailsForm — the lock token under polling (TASK-629)", () => {
  const COLLEAGUE_SAVED = {
    ...ORDER,
    updatedAt: "2026-06-01T10:00:30.000Z",
    internalNotes: "Нотатка колеги",
  } as unknown as OrderEntity;

  async function typeNotes(text: string) {
    await userEvent.type(
      screen.getByLabelText(dict.orders.internalNotes),
      text,
    );
  }

  async function save() {
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.detailsSave }),
    );
  }

  it("sends the version the operator started editing, not one a refetch brought in", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    capturePatch(bodies);

    const { rerender } = renderWithProviders(
      <OrderDetailsForm order={ORDER} />,
      { auth: WRITER },
    );
    await typeNotes("Моя нотатка");
    // The minute poll lands a colleague's save while the operator is typing.
    rerender(<OrderDetailsForm order={COLLEAGUE_SAVED} />);
    // Their text survives (forms.md Rule 2a)…
    expect(screen.getByLabelText(dict.orders.internalNotes)).toHaveValue(
      "Моя нотатка",
    );
    await save();

    // …and the save is judged against what they saw, so the server answers
    // 409 instead of silently overwriting «Нотатка колеги».
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ expectedUpdatedAt: ORDER.updatedAt });
  });

  it("takes the refreshed version while the form is still clean", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    capturePatch(bodies);

    const { rerender } = renderWithProviders(
      <OrderDetailsForm order={ORDER} />,
      { auth: WRITER },
    );
    // The refetch lands BEFORE the operator touches anything: what they then
    // edit is the colleague's version, so that is the token.
    rerender(<OrderDetailsForm order={COLLEAGUE_SAVED} />);
    await typeNotes(" + моє");
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      expectedUpdatedAt: COLLEAGUE_SAVED.updatedAt,
    });
  });

  it("after a 409 the retry is made over the refetched version, not the refused one", async () => {
    const REFETCHED = "2026-06-01T10:01:00.000Z";
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.patch("*/api/admin/orders/:orderId", async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        if (bodies.length === 1) {
          return HttpResponse.json(
            {
              statusCode: 409,
              error: "ORDER_STALE",
              message: "Order was modified",
            },
            { status: 409 },
          );
        }
        return HttpResponse.json({
          data: { ...ORDER, updatedAt: "2026-06-01T10:02:00.000Z" },
        });
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    // What the conflict's refetch finds in the cache.
    queryClient.setQueryData(
      getAdminOrderControllerFindByIdQueryKey(ORDER_ID),
      {
        data: { ...ORDER, updatedAt: REFETCHED },
      },
    );

    renderWithProviders(<OrderDetailsForm order={ORDER} />, {
      queryClient,
      auth: WRITER,
    });
    await typeNotes("Моя нотатка");
    await save();
    await waitFor(() =>
      expect(sonnerToast.error).toHaveBeenCalledWith(
        dict.orderStatus.conflict.ORDER_STALE,
        expect.anything(),
      ),
    );

    await save();
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[0]).toMatchObject({ expectedUpdatedAt: ORDER.updatedAt });
    expect(bodies[1]).toMatchObject({ expectedUpdatedAt: REFETCHED });
  });
});

// ─── The waybill rule must not take the notes hostage (TASK-426) ──────────────

describe("OrderDetailsForm — an order carrying a legacy waybill", () => {
  /**
   * The regression. The API learned that a ТТН is exactly 14 digits; this form
   * kept sending `trackingNumber` on EVERY save, so an order created before the
   * rule — «ТТН уточнюється», or a short number typed under TASK-335 — answered
   * 400 to a save of its INTERNAL NOTES. The operator was refused over a field
   * they never touched, and the toast named neither the field nor the rule.
   */
  it("saves the internal notes without sending the waybill it did not touch", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    capturePatch(bodies);

    renderWithProviders(<OrderDetailsForm order={LEGACY_ORDER} />, {
      auth: WRITER,
    });

    await userEvent.type(
      screen.getByLabelText(dict.orders.internalNotes),
      "Передзвонити",
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.detailsSave }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    // An omitted key means "leave it alone": the value stays on the order and
    // the rule never judges it.
    expect(bodies[0]).not.toHaveProperty("trackingNumber");
    expect(bodies[0]).toMatchObject({ internalNotes: "Передзвонити" });
    expect(sonnerToast.success).toHaveBeenCalledWith(
      dict.orders.detailsSaved,
      undefined,
    );
  });

  it("shows the legacy value rather than marking the form invalid on load", () => {
    renderWithProviders(<OrderDetailsForm order={LEGACY_ORDER} />, {
      auth: WRITER,
    });

    expect(screen.getByLabelText(dict.orders.trackingNumber)).toHaveValue(
      LEGACY_TRACKING,
    );
    expect(
      screen.queryByText(dict.orders.trackingNumberInvalid),
    ).not.toBeInTheDocument();
  });

  it("still demands 14 digits once the operator edits the field", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    capturePatch(bodies);

    renderWithProviders(<OrderDetailsForm order={LEGACY_ORDER} />, {
      auth: WRITER,
    });

    await userEvent.clear(screen.getByLabelText(dict.orders.trackingNumber));
    await userEvent.type(
      screen.getByLabelText(dict.orders.trackingNumber),
      "123",
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.detailsSave }),
    );

    expect(
      await screen.findByText(dict.orders.trackingNumberInvalid),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });
});

describe("OrderDetailsForm — a rejected save says which field and which rule", () => {
  it("names the waybill instead of the generic «не вдалося зберегти»", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    // A 400 the client rule did not anticipate — the two ends disagreeing is
    // exactly when the operator needs the server's reason, in our own words.
    capturePatch(bodies, {
      status: 400,
      body: {
        statusCode: 400,
        error: "Bad Request",
        message: [
          "trackingNumber: A Nova Poshta waybill (ТТН) is exactly 14 digits",
        ],
      },
    });

    renderWithProviders(<OrderDetailsForm order={ORDER} />, { auth: WRITER });
    await saveWaybill();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(sonnerToast.error).toHaveBeenCalledWith(
      dict.orders.detailsFailedTracking,
      expect.anything(),
    );
    expect(sonnerToast.error).not.toHaveBeenCalledWith(
      dict.orders.detailsFailed,
      expect.anything(),
    );
    // …and under the field as well: a toast is gone in a moment, the box that
    // needs fixing is still there.
    expect(
      await screen.findByText(dict.orders.trackingNumberInvalid),
    ).toBeInTheDocument();
    // The English constraint text never reaches an operator.
    expect(screen.queryByText(/Nova Poshta waybill/i)).not.toBeInTheDocument();
    // And it is not dressed up as a lost update: Nest's 400 envelope carries
    // `error: "Bad Request"`, which the conflict decoder reads as a code.
    expect(
      screen.queryByText(dict.orderStatus.conflictUnknown),
    ).not.toBeInTheDocument();
  });

  it("still falls back to the generic message for a failure it cannot name", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    capturePatch(bodies, {
      status: 500,
      body: { statusCode: 500, message: "Internal server error" },
    });

    renderWithProviders(<OrderDetailsForm order={ORDER} />, { auth: WRITER });
    await saveWaybill();

    await waitFor(() =>
      expect(sonnerToast.error).toHaveBeenCalledWith(
        dict.orders.detailsFailed,
        expect.anything(),
      ),
    );
  });
});

/**
 * TASK-715 — the PATCH needs `orders:write`. A reader without it used to get the
 * inputs and «Зберегти», and every save answered 403 with a toast blaming a
 * concurrent edit. Now: the values as text, no inputs, no button.
 */
describe("OrderDetailsForm — without orders:write (TASK-715)", () => {
  const READER = { permissions: ["orders:read"] };

  it("shows the waybill and internal notes as text, with no inputs and no save", () => {
    const order = {
      ...ORDER,
      trackingNumber: WAYBILL,
      internalNotes: "Передзвонити після 18:00",
    } as unknown as OrderEntity;

    renderWithProviders(<OrderDetailsForm order={order} />, { auth: READER });

    expect(screen.getByText(WAYBILL)).toBeInTheDocument();
    expect(screen.getByText("Передзвонити після 18:00")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.orders.detailsSave }),
    ).not.toBeInTheDocument();
  });

  it("says «not set» for empty values instead of leaving a blank", () => {
    renderWithProviders(<OrderDetailsForm order={ORDER} />, { auth: READER });

    expect(screen.getAllByText(dict.orders.detailsValueEmpty)).toHaveLength(2);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders neither the text nor the editor while the rights are loading", () => {
    renderWithProviders(<OrderDetailsForm order={ORDER} />, {
      auth: { permissions: [], arePermissionsLoading: true },
    });

    expect(
      screen.queryByText(dict.orders.detailsValueEmpty),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.orders.detailsSave }),
    ).not.toBeInTheDocument();
  });

  it("renders the editor for a session that holds the right", () => {
    renderWithProviders(<OrderDetailsForm order={ORDER} />, { auth: WRITER });

    expect(
      screen.getByLabelText(dict.orders.trackingNumber),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.orders.detailsSave }),
    ).toBeInTheDocument();
  });
});

/** Wave 198 (TASK-1046, К1/К3). */
describe("OrderDetailsForm — the waybill by mockup", () => {
  it("says how many digits there are now under the rule", async () => {
    renderWithProviders(<OrderDetailsForm order={ORDER} />, { auth: WRITER });

    await userEvent.type(
      screen.getByLabelText(dict.orders.trackingNumber),
      "2045091234567",
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.detailsSave }),
    );

    const error = await screen.findByText(dict.orders.trackingNumberInvalid);
    expect(error).toHaveTextContent(dict.orders.trackingNumberDigitsNow(13));
  });

  it("links a valid waybill to Nova Poshta's tracking page", async () => {
    renderWithProviders(
      <OrderDetailsForm
        order={{ ...ORDER, trackingNumber: "2045 0000 0000 01" } as OrderEntity}
      />,
      { auth: WRITER },
    );

    const link = await screen.findByRole("link", {
      name: dict.orders.trackOnNp,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://novaposhta.ua/tracking/?cargo_number=20450000000001",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("offers «Оновити» on a stale-write conflict", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    capturePatch(bodies, {
      status: 409,
      body: { error: "ORDER_STALE", message: "stale", statusCode: 409 },
    });
    renderWithProviders(<OrderDetailsForm order={ORDER} />, { auth: WRITER });

    await userEvent.type(
      screen.getByLabelText(dict.orders.internalNotes),
      "Передзвонити",
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.detailsSave }),
    );

    expect(
      await screen.findByText(dict.orderStatus.conflict.ORDER_STALE),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.orderStatus.reloadCta }),
    ).toBeInTheDocument();
  });
});
