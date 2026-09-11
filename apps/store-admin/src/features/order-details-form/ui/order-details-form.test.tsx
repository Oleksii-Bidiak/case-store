import { http, HttpResponse } from "msw";
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
