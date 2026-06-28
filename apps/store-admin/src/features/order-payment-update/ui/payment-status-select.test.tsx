import { http, HttpResponse, delay } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
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

function renderSelect(currentPaymentStatus = "PENDING") {
  return renderWithProviders(
    <PaymentStatusSelect
      orderId={ORDER_ID}
      currentPaymentStatus={currentPaymentStatus}
    />,
  );
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
});
