import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeOrder } from "@/shared/test/msw-handlers";
import { type OrderEntityStatus } from "@/entities/order";
import { dict } from "@/shared/config";
import { OrderHistoryView } from "./order-history-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

/**
 * The trigger carries an aria-label naming its order, because on a history page
 * every row's button reads the same — so it is matched by that label, not by the
 * visible text an aria-label overrides.
 */
const RETURN_TRIGGER = new RegExp(dict.returnRequest.trigger);

/**
 * Every status the button must stay away from. Spelled as the generated union
 * rather than as strings: the list is the point of the test, and a status
 * renamed in the API has to break this file rather than quietly pass.
 */
const NOT_DELIVERED = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "CANCELLED",
] as const satisfies readonly OrderEntityStatus[];

/** Serve `/api/orders` with one order per status given. */
function stubOrders(statuses: readonly OrderEntityStatus[]) {
  server.use(
    http.get("*/api/orders", () =>
      HttpResponse.json({
        data: statuses.map(
          (status, index) =>
            makeOrder({ id: `order-${index + 1}`, status }).data,
        ),
      }),
    ),
  );
}

const renderHistory = () =>
  renderWithProviders(<OrderHistoryView />, {
    auth: { isAuthenticated: true, accessToken: "token" },
  });

/**
 * TASK-373 — the storefront's first test of this widget, and it is about the one
 * thing it could not do: open a return. `POST /orders/:orderId/returns` has been
 * there since TASK-340; the account area had no button anywhere, so the endpoint
 * was unreachable by the only people entitled to use it.
 */
describe("OrderHistoryView — return request (TASK-373)", () => {
  it("offers a return on a delivered order, labelled with that order", async () => {
    stubOrders(["DELIVERED"]);

    renderHistory();

    expect(
      await screen.findByRole("button", {
        name: dict.returnRequest.triggerAria("#ORDER-1"),
      }),
    ).toBeInTheDocument();
  });

  it.each(NOT_DELIVERED)(
    "offers nothing on a %s order — the goods are not with the customer yet",
    async (status) => {
      stubOrders([status]);

      renderHistory();

      // Wait for the list to render before asserting an absence.
      await screen.findByText(/#ORDER-1/i);
      expect(
        screen.queryByRole("button", { name: RETURN_TRIGGER }),
      ).not.toBeInTheDocument();
    },
  );

  it("offers it on the delivered order only, in a mixed list", async () => {
    stubOrders(["PENDING", "DELIVERED"]);

    renderHistory();

    await screen.findByText(/#ORDER-1/i);
    expect(
      screen.getAllByRole("button", { name: RETURN_TRIGGER }),
    ).toHaveLength(1);
  });
});
