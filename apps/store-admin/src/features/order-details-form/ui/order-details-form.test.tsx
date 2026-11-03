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
  useAdminOrderControllerFindById,
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
});

// ─── Two operators, one card (TASK-1972, AD-ORD-67) ───────────────────────────

/**
 * The regression. After the 409 the form used to rebase its lock token onto the
 * refetched version straight away — before the operator had seen anything — and
 * `keepDirtyValues` kept their draft over the colleague's text. The second
 * «Зберегти» then went through with the colleague's token and silently
 * overwrote the colleague's note: the lock only postponed the loss by a click.
 *
 * Now the 409 opens a review: the colleague's version is shown next to the
 * draft, and the token moves only when the operator says what to keep.
 *
 * The form is mounted the way the order card mounts it — fed by the detail
 * query — so the refetch after the 409 reaches it as a new `order` prop.
 */
describe("OrderDetailsForm — a colleague saved first (TASK-1972)", () => {
  const V1 = "2026-06-01T10:00:00.000Z";
  const V2 = "2026-06-01T10:00:30.000Z";
  const V3 = "2026-06-01T10:02:00.000Z";
  const COLLEAGUE_NOTE = "Нотатка колеги";
  const MY_NOTE = "Моя нотатка";

  /** The order as the server holds it — the colleague's save mutates it. */
  let serverOrder: OrderEntity;
  let bodies: Array<Record<string, unknown>>;

  /** GET answers the server's order; PATCH applies the optimistic lock. */
  function stubServer() {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data: serverOrder }),
      ),
      http.patch("*/api/admin/orders/:orderId", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        if (body.expectedUpdatedAt !== serverOrder.updatedAt) {
          return HttpResponse.json(
            {
              statusCode: 409,
              error: "ORDER_STALE",
              message: "Order was modified",
            },
            { status: 409 },
          );
        }
        serverOrder = {
          ...serverOrder,
          ...("internalNotes" in body
            ? { internalNotes: body.internalNotes }
            : {}),
          ...("trackingNumber" in body
            ? { trackingNumber: body.trackingNumber }
            : {}),
          updatedAt: V3,
        } as OrderEntity;
        return HttpResponse.json({ data: serverOrder });
      }),
    );
  }

  /** The order card's wiring: the form is fed by the polled detail query. */
  function Card() {
    const { data } = useAdminOrderControllerFindById(ORDER_ID);
    return data?.data ? <OrderDetailsForm order={data.data} /> : null;
  }

  beforeEach(() => {
    serverOrder = { ...ORDER, updatedAt: V1 } as OrderEntity;
    bodies = [];
    stubServer();
  });

  // By role: once the review is open, its row is a group named after the field.
  const notes = () =>
    screen.getByRole("textbox", { name: dict.orders.internalNotes });
  const saveButton = () =>
    screen.getByRole("button", { name: dict.orders.detailsSave });

  /** Tab A types; tab B saves meanwhile; tab A's save is refused. */
  async function conflictOn(colleague: Partial<OrderEntity>) {
    renderWithProviders(<Card />, { auth: WRITER });
    await userEvent.type(
      await screen.findByLabelText(dict.orders.internalNotes),
      MY_NOTE,
    );
    serverOrder = {
      ...serverOrder,
      ...colleague,
      updatedAt: V2,
    } as OrderEntity;
    await userEvent.click(saveButton());
    await waitFor(() => expect(bodies).toHaveLength(1));
  }

  it("shows the colleague's note next to the draft, and the second «Зберегти» sends nothing", async () => {
    await conflictOn({ internalNotes: COLLEAGUE_NOTE });

    // The colleague's text is on screen, and the draft is still in the box.
    expect(await screen.findByText(COLLEAGUE_NOTE)).toBeInTheDocument();
    expect(notes()).toHaveValue(MY_NOTE);
    // The panel replaces the sticky toast rather than piling onto it.
    expect(sonnerToast.error).not.toHaveBeenCalled();

    // Not reviewed yet: a repeat save must not reach the server.
    expect(saveButton()).toBeDisabled();
    expect(
      screen.getByText(dict.orderStatus.staleReviewSaveHint),
    ).toBeInTheDocument();
    await userEvent.click(saveButton());
    expect(bodies).toHaveLength(1);
  });

  it("«Переглянув — зберегти мою» lets the draft go out over the colleague's version", async () => {
    await conflictOn({ internalNotes: COLLEAGUE_NOTE });

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
      internalNotes: MY_NOTE,
    });
  });

  it("«Взяти версію колеги» puts the colleague's text in the box and leaves nothing to save", async () => {
    await conflictOn({ internalNotes: COLLEAGUE_NOTE });

    await userEvent.click(
      await screen.findByRole("button", {
        name: dict.orderStatus.staleReviewTakeTheirs,
      }),
    );

    expect(notes()).toHaveValue(COLLEAGUE_NOTE);
    expect(saveButton()).toBeDisabled();
    expect(bodies).toHaveLength(1);
  });

  it("says to save again — once, inline — when the colleague's version cannot be fetched", async () => {
    server.use(
      http.get(
        "*/api/admin/orders/:orderId",
        // The card's own load succeeds; the fetch after the 409 fails.
        () =>
          bodies.length === 0
            ? HttpResponse.json({ data: serverOrder })
            : HttpResponse.json({ statusCode: 500 }, { status: 500 }),
      ),
    );
    await conflictOn({ internalNotes: COLLEAGUE_NOTE });

    expect(
      await screen.findByText(dict.orderStatus.staleReviewFetchFailed),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.orderStatus.conflict.ORDER_STALE),
    ).not.toBeInTheDocument();
    expect(sonnerToast.error).not.toHaveBeenCalled();
    // Saving again is the way forward: it is not blocked by a review.
    expect(saveButton()).toBeEnabled();
  });

  it("a colleague's change to an untouched field refreshes it, and the token moves only on «Зрозуміло»", async () => {
    await conflictOn({ trackingNumber: WAYBILL });

    expect(
      await screen.findByText(dict.orderStatus.staleReviewRefreshed),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(dict.orders.trackingNumber)).toHaveValue(
      WAYBILL,
    );
    expect(notes()).toHaveValue(MY_NOTE);
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
      internalNotes: MY_NOTE,
    });
    // The colleague's waybill is not sent back as if it were the operator's.
    expect(bodies[1]).not.toHaveProperty("trackingNumber");
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
      "https://novaposhta.ua/tracking/20450000000001",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("answers a stale-write conflict with the review panel, not a dead «Оновити»", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    capturePatch(bodies, {
      status: 409,
      body: { error: "ORDER_STALE", message: "stale", statusCode: 409 },
    });
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: { ...ORDER, updatedAt: "2026-06-01T10:00:30.000Z" },
        }),
      ),
    );
    renderWithProviders(<OrderDetailsForm order={ORDER} />, { auth: WRITER });

    await userEvent.type(
      screen.getByLabelText(dict.orders.internalNotes),
      "Передзвонити",
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.detailsSave }),
    );

    expect(
      await screen.findByText(dict.orderStatus.staleReviewTitle),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.orderStatus.reloadCta }),
    ).not.toBeInTheDocument();
  });
});
