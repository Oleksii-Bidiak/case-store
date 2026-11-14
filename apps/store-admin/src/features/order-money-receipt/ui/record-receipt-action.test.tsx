import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { OrderMoneyEntity } from "@/entities/order";
import { RecordReceiptAction } from "./record-receipt-action";

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const m = dict.orderMoney;
const WRITER = { auth: { permissions: ["orders:read", "orders:write"] } };

const MONEY = {
  orderId: "order-uuid-1",
  updatedAt: "2026-11-01T10:00:00.000Z",
  allowedInKinds: ["BANK_TRANSFER"],
  totals: { balanceKop: 10_000 },
} as unknown as OrderMoneyEntity;

function refuseWith(body: Record<string, unknown>) {
  server.use(
    http.post("*/api/admin/orders/:orderId/money/in", () =>
      HttpResponse.json({ statusCode: 400, ...body }, { status: 400 }),
    ),
  );
}

async function submitReceipt(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: m.receiptAction }));
  await user.click(await screen.findByRole("button", { name: /^Записати / }));
}

/** TASK-1984 Rule 6 — a refusal about one input is said under it, once. */
describe("RecordReceiptAction — where a refusal is said", () => {
  it("puts the server's «reason required» under the note, not in the banner", async () => {
    const user = userEvent.setup();
    refuseWith({
      error: "ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED",
      message: "A reason is required",
    });
    renderWithProviders(
      <RecordReceiptAction money={MONEY} onWritten={jest.fn()} />,
      WRITER,
    );

    await submitReceipt(user);

    const note = await screen.findByLabelText(m.overpaymentReasonLabel);
    await waitFor(() => expect(note).toHaveAttribute("aria-invalid", "true"));
    expect(
      screen.getAllByText(m.errors.ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED),
    ).toHaveLength(1);
  });

  it("puts a DTO refusal of the amount under the amount", async () => {
    const user = userEvent.setup();
    refuseWith({
      error: "Bad Request",
      message: "amountKop must not be greater than 2147483647",
      fieldErrors: [{ field: "amountKop", constraint: "max" }],
    });
    renderWithProviders(
      <RecordReceiptAction money={MONEY} onWritten={jest.fn()} />,
      WRITER,
    );

    await submitReceipt(user);

    const amount = screen.getByLabelText(m.amountLabel);
    await waitFor(() => expect(amount).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getAllByText(m.amountInvalid)).toHaveLength(1);
    expect(screen.queryByText(m.errors.generic)).not.toBeInTheDocument();
  });
});
