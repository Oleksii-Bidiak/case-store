import { http, HttpResponse, delay } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import { RefundPaymentButton } from "./refund-payment-button";

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const ORDER_ID = "order-uuid-1";
const PAYMENT = { id: "payment-uuid-1", amount: "1299.00" };
const t = dict.orders;

/**
 * Intl groups money with NBSP / narrow NBSP; Testing Library collapses those to
 * a plain space in the DOM text but not in the expected string — compare plain.
 */
const plain = (value: string) => value.replace(/\s+/g, " ");

/** Capture the refund POST: status + body the server should see. */
function stubRefund(status = 202, body?: unknown) {
  const seen: { body: unknown; calls: number } = { body: undefined, calls: 0 };
  server.use(
    http.post("*/api/admin/payments/:paymentId/refund", async ({ request }) => {
      seen.calls += 1;
      seen.body = await request.json();
      if (status === 202) {
        return HttpResponse.json({ data: { accepted: true } }, { status });
      }
      return HttpResponse.json(
        body ?? { statusCode: status, error: "Anything", message: "prose" },
        { status },
      );
    }),
  );
  return seen;
}

function renderButton() {
  return renderWithProviders(
    <RefundPaymentButton orderId={ORDER_ID} payment={PAYMENT} />,
  );
}

async function openDialog() {
  await userEvent.click(screen.getByRole("button", { name: t.refundAction }));
  return screen.findByRole("dialog");
}

async function choosePartial(amount: string) {
  const dialog = await openDialog();
  await userEvent.click(within(dialog).getByLabelText(t.refundModePartial));
  await userEvent.type(
    within(dialog).getByLabelText(t.refundAmountLabel),
    amount,
  );
  await userEvent.click(
    within(dialog).getByRole("button", { name: t.refundNext }),
  );
  return dialog;
}

describe("RefundPaymentButton (TASK-371)", () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it("confirms the exact full amount, sends no amount, and only says «requested»", async () => {
    const seen = stubRefund();
    renderButton();

    const dialog = await openDialog();
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.refundNext }),
    );

    // The confirmation step repeats the exact sum.
    const confirm = within(dialog).getByRole("button", {
      name: t.refundConfirm(formatCurrency("1299.00")),
    });
    expect(
      within(dialog).getByText(
        plain(t.refundConfirmText(formatCurrency("1299.00"))),
      ),
    ).toBeInTheDocument();
    await userEvent.click(confirm);

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(t.refundRequested),
    );
    // Omitted amount = the whole attempt, per RefundRequestDto.
    expect(seen.body).toEqual({});
    // No second refund before the callback: the button is off for this visit.
    expect(screen.getByRole("button", { name: t.refundAction })).toBeDisabled();
    expect(screen.getByText(t.refundPending)).toBeInTheDocument();
  });

  it("sends a partial amount as the validated decimal string", async () => {
    const seen = stubRefund();
    renderButton();

    const dialog = await choosePartial("499,50");
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: t.refundConfirm(formatCurrency("499.50")),
      }),
    );

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(t.refundRequested),
    );
    expect(seen.body).toEqual({ amount: "499.50" });
  });

  it("refuses more than the attempt charged under the field, and sends nothing", async () => {
    const seen = stubRefund();
    renderButton();

    const dialog = await choosePartial("1300");

    expect(
      within(dialog).getByText(
        plain(t.refundAmountTooLarge(formatCurrency("1299.00"))),
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(t.refundAmountLabel)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(seen.calls).toBe(0);
  });

  it("refuses zero and a malformed amount", async () => {
    const seen = stubRefund();
    renderButton();

    const dialog = await choosePartial("0");
    expect(within(dialog).getByText(t.refundAmountZero)).toBeInTheDocument();

    const input = within(dialog).getByLabelText(t.refundAmountLabel);
    await userEvent.clear(input);
    await userEvent.type(input, "12.345");
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.refundNext }),
    );
    expect(within(dialog).getByText(t.refundAmountInvalid)).toBeInTheDocument();
    expect(seen.calls).toBe(0);
  });

  it("disables the confirm button while the request is in flight", async () => {
    server.use(
      http.post("*/api/admin/payments/:paymentId/refund", async () => {
        await delay(200);
        return HttpResponse.json({ data: { accepted: true } }, { status: 202 });
      }),
    );
    renderButton();

    const dialog = await openDialog();
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.refundNext }),
    );
    const confirm = within(dialog).getByRole("button", {
      name: t.refundConfirm(formatCurrency("1299.00")),
    });
    await userEvent.click(confirm);

    await waitFor(() => expect(confirm).toBeDisabled());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it.each([
    [409, t.refundErrorConflict],
    [403, t.refundErrorForbidden],
    [404, t.refundErrorNotFound],
    [500, t.refundErrorGeneric],
  ])(
    "names a %s refusal by its status and leaves the button usable",
    async (status, message) => {
      stubRefund(status);
      renderButton();

      const dialog = await openDialog();
      await userEvent.click(
        within(dialog).getByRole("button", { name: t.refundNext }),
      );
      await userEvent.click(
        within(dialog).getByRole("button", {
          name: t.refundConfirm(formatCurrency("1299.00")),
        }),
      );

      await waitFor(() => expect(toastError).toHaveBeenCalledWith(message));
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: t.refundAction }),
      ).toBeEnabled();
    },
  );

  it("puts a server 400 back under the amount field", async () => {
    stubRefund(400);
    renderButton();

    const dialog = await choosePartial("100");
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: t.refundConfirm(formatCurrency("100")),
      }),
    );

    expect(
      await within(dialog).findByText(t.refundErrorTooLarge),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(t.refundAmountLabel)).toHaveValue(
      "100",
    );
    expect(toastError).not.toHaveBeenCalled();
  });
});
