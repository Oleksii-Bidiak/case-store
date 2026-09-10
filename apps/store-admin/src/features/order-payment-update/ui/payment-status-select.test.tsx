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
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  getAdminOrderControllerGetHistoryQueryKey,
} from "@/entities/order";
import { PaymentStatusSelect } from "./payment-status-select";

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const ORDER_ID = "order-uuid-1";

function stubPatch(status = 200) {
  server.use(
    http.patch("*/api/admin/orders/:orderId/payment-status", () => {
      if (status !== 200) {
        return new HttpResponse(null, { status });
      }
      return HttpResponse.json({
        data: { id: ORDER_ID, status: "PENDING", paymentStatus: "PAID" },
      });
    }),
  );
}

function renderSelect(
  currentPaymentStatus = "PENDING",
  queryClient?: QueryClient,
) {
  return renderWithProviders(
    <PaymentStatusSelect
      orderId={ORDER_ID}
      currentPaymentStatus={currentPaymentStatus}
    />,
    queryClient ? { queryClient } : {},
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
    screen.getByRole("combobox", { name: dict.orderStatus.paymentUpdateAria }),
  );

describe("PaymentStatusSelect (TASK-151)", () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it("lists every payment status except the current one", async () => {
    renderSelect("PENDING");
    await openSelect();

    // Current status (Очікує оплати) is excluded; the other three are offered.
    expect(
      screen.getByRole("option", { name: "Оплачено" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Помилка оплати" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Кошти повернено" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Очікує оплати" }),
    ).not.toBeInTheDocument();
  });

  it("calls the mutation and shows a success toast when a status is picked", async () => {
    stubPatch(200);
    renderSelect("PENDING");

    await openSelect();
    await userEvent.click(screen.getByRole("option", { name: "Оплачено" }));

    await screen.findByRole("combobox"); // settle
    expect(toastSuccess).toHaveBeenCalledWith(
      dict.orderStatus.paymentToastUpdated("Оплачено"),
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows an error toast when the update fails", async () => {
    stubPatch(500);
    renderSelect("PENDING");

    await openSelect();
    await userEvent.click(screen.getByRole("option", { name: "Оплачено" }));

    await new Promise((r) => setTimeout(r, 0));
    expect(toastError).toHaveBeenCalledWith(
      dict.orderStatus.paymentToastFailed,
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("disables the trigger while the mutation is in flight", async () => {
    server.use(
      http.patch("*/api/admin/orders/:orderId/payment-status", async () => {
        await delay(100);
        return HttpResponse.json({
          data: { id: ORDER_ID, status: "PENDING", paymentStatus: "PAID" },
        });
      }),
    );
    renderSelect("PENDING");

    await openSelect();
    await userEvent.click(screen.getByRole("option", { name: "Оплачено" }));

    // Mutation is pending → the trigger is disabled until it resolves.
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
    stubPatch(200);
    const { queryClient, invalidate } = spyingQueryClient();
    renderSelect("PENDING", queryClient);

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
    stubPatch(200);
    const { queryClient, invalidate } = spyingQueryClient();
    renderSelect("PENDING", queryClient);

    await openSelect();
    await userEvent.click(screen.getByRole("option", { name: "Оплачено" }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: getAdminOrderControllerGetHistoryQueryKey(ORDER_ID),
      }),
    );
  });
});
