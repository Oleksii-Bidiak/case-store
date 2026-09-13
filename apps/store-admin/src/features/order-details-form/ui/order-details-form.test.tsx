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

    renderWithProviders(<OrderDetailsForm order={ORDER} />, { queryClient });
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

    renderWithProviders(<OrderDetailsForm order={ORDER} />);
    await saveWaybill();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      trackingNumber: WAYBILL,
      expectedUpdatedAt: ORDER.updatedAt,
    });
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

    renderWithProviders(<OrderDetailsForm order={LEGACY_ORDER} />);

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
    renderWithProviders(<OrderDetailsForm order={LEGACY_ORDER} />);

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

    renderWithProviders(<OrderDetailsForm order={LEGACY_ORDER} />);

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

    renderWithProviders(<OrderDetailsForm order={ORDER} />);
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

    renderWithProviders(<OrderDetailsForm order={ORDER} />);
    await saveWaybill();

    await waitFor(() =>
      expect(sonnerToast.error).toHaveBeenCalledWith(
        dict.orders.detailsFailed,
        expect.anything(),
      ),
    );
  });
});
