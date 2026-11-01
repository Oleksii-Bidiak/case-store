import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { formatKop } from "@/shared/lib";
import { toast } from "@/shared/ui/toast";
import { OrderPaymentBlock } from "./order-payment-block";

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const m = dict.orderMoney;
const ORDER_ID = "order-uuid-1";
const UPDATED_AT = "2026-10-30T12:00:00.000Z";
const ORDER = { id: ORDER_ID, paymentStatus: "PENDING" as const };

/** Intl groups with NBSP / narrow NBSP; the DOM text is compared on plain spaces. */
const plain = (value: string) => value.replace(/[\u00a0\u202f]/g, " ");
const text = (value: string) =>
  new RegExp(
    plain(value)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/ /g, "\\s"),
  );

type Money = Record<string, unknown> & {
  totals: Record<string, number>;
  entries: Array<Record<string, unknown>>;
};

function makeMoney(overrides: Partial<Money> = {}): Money {
  const { totals, ...rest } = overrides;
  return {
    orderId: ORDER_ID,
    orderStatus: "PENDING",
    paymentStatus: "PENDING",
    paymentMethod: "ON_DELIVERY",
    deliveryMethod: "NOVA_POSHTA",
    updatedAt: UPDATED_AT,
    entries: [],
    allowedInKinds: ["COD_NOVA_POSHTA", "BANK_TRANSFER"],
    refundablePayments: null,
    outWithoutReturnMaxKop: 0,
    returns: [],
    ...rest,
    totals: {
      totalKop: 129900,
      paidKop: 0,
      refundedKop: 0,
      returnCreditKop: 0,
      balanceKop: 129900,
      ...totals,
    },
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    direction: "IN",
    kind: "PAID_AT_POINT",
    amountKop: 50000,
    returnId: null,
    paymentId: null,
    providerState: null,
    actorId: "admin-1",
    actorName: "Олена Коваль",
    reason: null,
    reversalOfId: null,
    reversedById: null,
    voidedAt: null,
    voidReason: null,
    legacy: false,
    occurredAt: "2026-10-29T10:00:00.000Z",
    createdAt: "2026-10-29T10:00:00.000Z",
    ...overrides,
  };
}

/** Serve `money` on GET …/money; counts the reads. */
function serveMoney(money: Money | (() => Money)) {
  const seen = { reads: 0 };
  server.use(
    http.get("*/api/admin/orders/:orderId/money", () => {
      seen.reads += 1;
      return HttpResponse.json({
        data: typeof money === "function" ? money() : money,
      });
    }),
  );
  return seen;
}

const ALL = [
  "orders:read",
  "orders:write",
  "payments:read",
  "payments:refund",
  "payments:correct",
  "returns:write",
];

function renderBlock(
  permissions: string[] = ALL,
  onCreateReturn: () => void = jest.fn(),
) {
  return renderWithProviders(
    <OrderPaymentBlock order={ORDER} onCreateReturn={onCreateReturn} />,
    { auth: { permissions } },
  );
}

const summary = () => screen.findByRole("group", { name: m.summaryAria });

beforeEach(() => {
  jest.mocked(toast.success).mockClear();
  jest.mocked(toast.error).mockClear();
});

describe("OrderPaymentBlock — what the money is (R2, TASK-2047)", () => {
  it("shows paid of total, the refund and «До сплати» straight from the payload", async () => {
    serveMoney(
      makeMoney({
        paymentStatus: "PARTIALLY_PAID",
        totals: { paidKop: 50000, refundedKop: 10000, balanceKop: 89900 },
      }),
    );
    renderBlock(["orders:read"]);

    const group = await summary();
    expect(group).toHaveTextContent(
      text(m.paidOf(formatKop(50000), formatKop(129900))),
    );
    expect(group).toHaveTextContent(text(m.refunded(formatKop(10000))));
    // The balance is the server's — 89 900, not 129 900 − 50 000 + 10 000. An
    // order not yet delivered owes nothing YET: «До сплати», not «Борг».
    expect(group).toHaveTextContent(text(m.toPay(formatKop(89900))));
    expect(group).not.toHaveTextContent(/Борг/);
    expect(group).not.toHaveTextContent(m.owedToCustomer("").trim());
    expect(screen.getByText("Частково оплачено")).toBeInTheDocument();
  });

  it("says «Борг» once the order is DELIVERED — as the header mark does (TASK-1968)", async () => {
    serveMoney(
      makeMoney({
        orderStatus: "DELIVERED",
        paymentStatus: "PARTIALLY_PAID",
        totals: { paidKop: 50000, balanceKop: 79900 },
      }),
    );
    renderBlock(["orders:read"]);

    const group = await summary();
    expect(group).toHaveTextContent(text(m.debt(formatKop(79900))));
    expect(group).not.toHaveTextContent(/До сплати/);
  });

  it("says «Винні покупцю» on a negative balance, unsigned", async () => {
    serveMoney(
      makeMoney({
        paymentStatus: "PAID",
        totals: { paidKop: 139900, balanceKop: -10000 },
      }),
    );
    renderBlock(["orders:read"]);

    const group = await summary();
    expect(group).toHaveTextContent(text(m.owedToCustomer(formatKop(10000))));
    expect(group).not.toHaveTextContent(/Борг/);
  });

  it("says neither on a settled order, and no «Повернуто» at zero", async () => {
    serveMoney(
      makeMoney({
        paymentStatus: "PAID",
        totals: { paidKop: 129900, balanceKop: 0 },
      }),
    );
    renderBlock(["orders:read"]);

    const group = await summary();
    expect(group).not.toHaveTextContent(/Борг|Винні покупцю|Повернуто/);
    expect(screen.queryByTestId("money-due")).not.toBeInTheDocument();
  });

  it("lists the journal with who, the kind and the signed amount", async () => {
    serveMoney(
      makeMoney({
        totals: { paidKop: 129900, refundedKop: 50000, balanceKop: 50000 },
        entries: [
          makeEntry({
            id: "e-in",
            kind: "LIQPAY_PAYMENT",
            amountKop: 129900,
            actorId: null,
            actorName: null,
            paymentId: "pay-1",
          }),
          makeEntry({
            id: "e-out",
            direction: "OUT",
            kind: "CASH_REFUND",
            amountKop: 50000,
            reason: "Покупець передумав",
          }),
        ],
      }),
    );
    renderBlock(["orders:read"]);

    const rows = await screen.findAllByTestId("money-entry");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(m.directionIn);
    expect(rows[0]).toHaveTextContent(m.kindLabels.LIQPAY_PAYMENT);
    expect(rows[0]).toHaveTextContent(m.actorLiqPay);
    expect(rows[0]).toHaveTextContent(text(`+${formatKop(129900)}`));
    expect(rows[1]).toHaveTextContent(m.directionOut);
    expect(rows[1]).toHaveTextContent(m.kindLabels.CASH_REFUND);
    expect(rows[1]).toHaveTextContent("Олена Коваль");
    expect(rows[1]).toHaveTextContent(text(`−${formatKop(50000)}`));
    expect(rows[1]).toHaveTextContent("Покупець передумав");
  });

  it("strikes a reversed entry through and links it to its reversal", async () => {
    serveMoney(
      makeMoney({
        entries: [
          makeEntry({ id: "e-1", reversedById: "e-2" }),
          makeEntry({
            id: "e-2",
            reversalOfId: "e-1",
            reason: "Помилково записали",
            occurredAt: "2026-10-29T11:00:00.000Z",
            createdAt: "2026-10-29T11:00:00.000Z",
          }),
        ],
      }),
    );
    renderBlock(["orders:read"]);

    const [original, reversal] = await screen.findAllByTestId("money-entry");
    expect(within(original).getByText(m.kindLabels.PAID_AT_POINT)).toHaveClass(
      "line-through",
    );
    expect(
      within(original).getByRole("link", { name: m.reversedByLink }),
    ).toHaveAttribute("href", "#money-entry-e-2");
    expect(reversal).toHaveTextContent(m.reversalLabel);
    expect(reversal).toHaveTextContent(text(`−${formatKop(50000)}`));
    expect(
      within(reversal).getByRole("link", { name: /Сторно запису від/ }),
    ).toHaveAttribute("href", "#money-entry-e-1");
  });

  it("marks a LiqPay refund awaiting confirmation, a voided one and a migrated row", async () => {
    serveMoney(
      makeMoney({
        entries: [
          makeEntry({ id: "e-legacy", legacy: true }),
          makeEntry({
            id: "e-req",
            direction: "OUT",
            kind: "LIQPAY_REFUND",
            providerState: "REQUESTED",
          }),
          makeEntry({
            id: "e-void",
            direction: "OUT",
            kind: "LIQPAY_REFUND",
            providerState: "REQUESTED",
            voidedAt: "2026-10-29T12:00:00.000Z",
            voidReason: "LiqPay відмовив",
          }),
        ],
      }),
    );
    renderBlock(["orders:read"]);

    const [legacy, requested, voided] =
      await screen.findAllByTestId("money-entry");
    expect(legacy).toHaveTextContent(m.legacyChip);
    expect(requested).toHaveTextContent(m.requestedChip);
    expect(voided).toHaveTextContent(m.voidedChip);
    expect(voided).not.toHaveTextContent(m.requestedChip);
    expect(voided).toHaveTextContent(m.voidReason("LiqPay відмовив"));
  });

  it("raises the unmatched-refund and the unknown-legacy-amount chips from the history", async () => {
    serveMoney(makeMoney({ totals: { paidKop: 129900, balanceKop: 0 } }));
    server.use(
      http.get("*/api/admin/orders/:orderId/history", () =>
        HttpResponse.json({
          data: [
            {
              id: "h-1",
              orderId: ORDER_ID,
              changeType: "PAYMENT_STATUS",
              fromStatus: null,
              toStatus: null,
              fromPaymentStatus: "PAID",
              toPaymentStatus: "PAID",
              changedBy: null,
              note: "PROVIDER_REFUND_UNMATCHED",
              rejectedPaymentStatus: null,
              changedAt: "2026-10-30T09:00:00.000Z",
            },
            {
              id: "h-2",
              orderId: ORDER_ID,
              changeType: "PAYMENT_STATUS",
              fromStatus: null,
              toStatus: null,
              fromPaymentStatus: "PAID",
              toPaymentStatus: "PARTIALLY_REFUNDED",
              changedBy: null,
              note: "LEGACY_MONEY_UNKNOWN",
              rejectedPaymentStatus: null,
              changedAt: "2026-10-30T08:00:00.000Z",
            },
          ],
        }),
      ),
    );
    renderBlock(["orders:read"]);

    expect(await screen.findByText(m.unmatchedRefundChip)).toBeInTheDocument();
    expect(screen.getByText(m.legacyUnknownChip)).toBeInTheDocument();
  });
});

describe("OrderPaymentBlock — what is due, by delivery (TASK-1807)", () => {
  it.each([
    ["NOVA_POSHTA", m.dueNovaPoshta, m.dueNovaPoshtaHint],
    ["PICKUP", m.duePickup, m.duePickupHint],
    ["COURIER", m.dueCourier, m.dueCourierHint],
    ["OTHER", m.dueOther, m.dueOtherHint],
  ])("words cash on delivery for %s", async (deliveryMethod, title, hint) => {
    serveMoney(makeMoney({ deliveryMethod }));
    renderBlock(["orders:read"]);

    const due = await screen.findByTestId("money-due");
    expect(due).toHaveTextContent(text(title(formatKop(129900))));
    expect(due).toHaveTextContent(hint);
    // «Гроші від НП» only ever belongs to a Nova Poshta order.
    if (deliveryMethod !== "NOVA_POSHTA") {
      expect(due).not.toHaveTextContent(/Нової Пошти|НП/);
    }
  });

  it("words a bank-transfer order as such", async () => {
    serveMoney(
      makeMoney({ paymentMethod: "BANK_TRANSFER", deliveryMethod: "PICKUP" }),
    );
    renderBlock(["orders:read"]);

    expect(await screen.findByTestId("money-due")).toHaveTextContent(
      text(m.dueBankTransfer(formatKop(129900))),
    );
  });

  it("offers the receipt kinds the server allows, named by delivery", async () => {
    const user = userEvent.setup();
    serveMoney(
      makeMoney({
        deliveryMethod: "PICKUP",
        allowedInKinds: ["PAID_AT_POINT", "BANK_TRANSFER"],
      }),
    );
    renderBlock();

    await user.click(
      await screen.findByRole("button", { name: m.receiptAction }),
    );
    const dialog = await screen.findByRole("dialog", { name: m.receiptTitle });
    expect(
      within(dialog).getByRole("radio", { name: m.receiptKinds.PAID_AT_POINT }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole("radio", { name: m.receiptKinds.BANK_TRANSFER }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("radio", {
        name: m.receiptKinds.COD_NOVA_POSHTA,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows no due box on a card order — LiqPay records itself", async () => {
    serveMoney(makeMoney({ paymentMethod: "ONLINE" }));
    renderBlock(["orders:read"]);

    await summary();
    expect(screen.queryByTestId("money-due")).not.toBeInTheDocument();
  });
});

describe("OrderPaymentBlock — «Записати надходження»", () => {
  function captureReceipts(
    respond: () => Response | ReturnType<typeof HttpResponse.json> = () =>
      HttpResponse.json({
        data: makeMoney({
          paymentStatus: "PARTIALLY_PAID",
          updatedAt: "2026-10-30T12:05:00.000Z",
          totals: { paidKop: 105000, balanceKop: 24900 },
        }),
      }),
  ) {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post("*/api/admin/orders/:orderId/money/in", async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return respond();
      }),
    );
    return bodies;
  }

  it("prefills what is due and sends whole kopecks with the lock token", async () => {
    const user = userEvent.setup();
    serveMoney(makeMoney());
    const bodies = captureReceipts();
    renderBlock();

    await user.click(
      await screen.findByRole("button", { name: m.receiptAction }),
    );
    const dialog = await screen.findByRole("dialog", { name: m.receiptTitle });
    const amount = within(dialog).getByLabelText(m.amountLabel);
    expect(amount).toHaveValue("1299");

    // A part payment, typed the Ukrainian way.
    await user.clear(amount);
    await user.type(amount, "1 050,10");
    await user.click(within(dialog).getByRole("button", { name: /^Записати/ }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      kind: "COD_NOVA_POSHTA",
      amountKop: 105010,
      note: null,
      expectedUpdatedAt: UPDATED_AT,
    });
    expect(Number.isInteger(bodies[0].amountKop)).toBe(true);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledWith(m.receiptToast);
    // The fresh payload the write answered with replaces the block's numbers.
    expect(await summary()).toHaveTextContent(text(m.toPay(formatKop(24900))));
  });

  it("requires a reason for an overpayment and sends it as the note", async () => {
    const user = userEvent.setup();
    serveMoney(makeMoney());
    const bodies = captureReceipts();
    renderBlock();

    await user.click(
      await screen.findByRole("button", { name: m.receiptAction }),
    );
    const dialog = await screen.findByRole("dialog", { name: m.receiptTitle });
    const amount = within(dialog).getByLabelText(m.amountLabel);
    await user.clear(amount);
    await user.type(amount, "1400");

    const reason = within(dialog).getByLabelText(m.overpaymentReasonLabel);
    expect(reason).toBeRequired();
    await user.click(within(dialog).getByRole("button", { name: /^Записати/ }));
    expect(await within(dialog).findByText(m.reasonRequired)).toBeVisible();
    expect(bodies).toHaveLength(0);

    await user.type(reason, "Доплата за доставку");
    await user.click(within(dialog).getByRole("button", { name: /^Записати/ }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      amountKop: 140000,
      note: "Доплата за доставку",
    });
  });

  it("refuses an amount that is not money before asking the server", async () => {
    const user = userEvent.setup();
    serveMoney(makeMoney());
    const bodies = captureReceipts();
    renderBlock();

    await user.click(
      await screen.findByRole("button", { name: m.receiptAction }),
    );
    const dialog = await screen.findByRole("dialog", { name: m.receiptTitle });
    const amount = within(dialog).getByLabelText(m.amountLabel);
    await user.clear(amount);
    await user.type(amount, "12,345");
    await user.click(within(dialog).getByRole("button", { name: /^Записати/ }));

    expect(await within(dialog).findByText(m.amountInvalid)).toBeVisible();
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(bodies).toHaveLength(0);
  });

  it("on 409 ORDER_STALE refetches the money and tells the operator", async () => {
    const user = userEvent.setup();
    const seen = serveMoney(makeMoney());
    captureReceipts(() =>
      HttpResponse.json(
        {
          statusCode: 409,
          error: "ORDER_STALE",
          message: "This order changed since it was loaded — reload and retry",
        },
        { status: 409 },
      ),
    );
    renderBlock();

    await user.click(
      await screen.findByRole("button", { name: m.receiptAction }),
    );
    const dialog = await screen.findByRole("dialog", { name: m.receiptTitle });
    const readsBefore = seen.reads;
    await user.click(within(dialog).getByRole("button", { name: /^Записати/ }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(m.errors.ORDER_STALE),
    );
    await waitFor(() => expect(seen.reads).toBeGreaterThan(readsBefore));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog open with the reason on a refusal that will not pass", async () => {
    const user = userEvent.setup();
    serveMoney(makeMoney());
    captureReceipts(() =>
      HttpResponse.json(
        {
          statusCode: 400,
          error: "ORDER_MONEY_IN_KIND_NOT_ALLOWED",
          message:
            "This kind of receipt does not fit the order's delivery method",
        },
        { status: 400 },
      ),
    );
    renderBlock();

    await user.click(
      await screen.findByRole("button", { name: m.receiptAction }),
    );
    const dialog = await screen.findByRole("dialog", { name: m.receiptTitle });
    await user.click(within(dialog).getByRole("button", { name: /^Записати/ }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      m.errors.ORDER_MONEY_IN_KIND_NOT_ALLOWED,
    );
  });
});

describe("OrderPaymentBlock — «Повернути гроші» (R2, TASK-951)", () => {
  it("is offered only while the server allows money back without a return", async () => {
    serveMoney(
      makeMoney({
        orderStatus: "CANCELLED",
        paymentStatus: "PAID",
        totals: { paidKop: 129900, balanceKop: -129900 },
        outWithoutReturnMaxKop: 129900,
      }),
    );
    const { unmount } = renderBlock();
    expect(
      await screen.findByRole("button", { name: m.payoutAction }),
    ).toBeInTheDocument();
    unmount();

    serveMoney(makeMoney({ outWithoutReturnMaxKop: 0 }));
    renderBlock();
    await summary();
    expect(
      screen.queryByRole("button", { name: m.payoutAction }),
    ).not.toBeInTheDocument();
  });

  it("points a shipped order without overpayment at a return instead", async () => {
    const user = userEvent.setup();
    const onCreateReturn = jest.fn();
    serveMoney(
      makeMoney({
        orderStatus: "DELIVERED",
        paymentStatus: "PAID",
        totals: { paidKop: 129900, balanceKop: 0 },
        outWithoutReturnMaxKop: 0,
      }),
    );
    renderBlock(ALL, onCreateReturn);

    expect(await screen.findByText(m.payoutViaReturn)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: m.payoutAction }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: m.payoutViaReturnAction }),
    );
    expect(onCreateReturn).toHaveBeenCalledTimes(1);
  });

  it("refunds through LiqPay to the chosen attempt, capped by what is left on it", async () => {
    const user = userEvent.setup();
    serveMoney(
      makeMoney({
        orderStatus: "CANCELLED",
        paymentStatus: "PAID",
        paymentMethod: "ONLINE",
        totals: { paidKop: 129900, balanceKop: -129900 },
        outWithoutReturnMaxKop: 129900,
        refundablePayments: [
          { paymentId: "pay-abcdef12", remainingKop: 100000 },
        ],
      }),
    );
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(
        "*/api/admin/orders/:orderId/money/out",
        async ({ request }) => {
          bodies.push((await request.json()) as Record<string, unknown>);
          return HttpResponse.json({ data: makeMoney() });
        },
      ),
    );
    renderBlock();

    await user.click(
      await screen.findByRole("button", { name: m.payoutAction }),
    );
    const dialog = await screen.findByRole("dialog", { name: m.payoutTitle });
    await user.click(
      within(dialog).getByRole("radio", {
        name: m.payoutMethods.LIQPAY_REFUND,
      }),
    );
    // 1 299 prefilled, but the attempt holds only 1 000.
    await user.click(
      within(dialog).getByRole("button", { name: /^Повернути/ }),
    );
    expect(
      await within(dialog).findByText(
        text(m.amountTooLarge(formatKop(100000))),
      ),
    ).toBeVisible();
    expect(bodies).toHaveLength(0);

    const amount = within(dialog).getByLabelText(m.amountLabel);
    await user.clear(amount);
    await user.type(amount, "1000");
    await user.click(
      within(dialog).getByRole("button", { name: /^Повернути/ }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      kind: "LIQPAY_REFUND",
      amountKop: 100000,
      paymentId: "pay-abcdef12",
      reason: null,
      expectedUpdatedAt: UPDATED_AT,
    });
    expect(toast.success).toHaveBeenCalledWith(m.payoutLiqpayToast);
  });

  it("hides LiqPay from a reader without payments:read, and says how much is left on EXCEEDS", async () => {
    const user = userEvent.setup();
    serveMoney(
      makeMoney({
        orderStatus: "CANCELLED",
        totals: { paidKop: 129900, balanceKop: -129900 },
        outWithoutReturnMaxKop: 129900,
        refundablePayments: null,
      }),
    );
    server.use(
      http.post("*/api/admin/orders/:orderId/money/out", () =>
        HttpResponse.json(
          {
            statusCode: 409,
            error: "ORDER_MONEY_REFUND_EXCEEDS_PAID",
            message:
              "Cannot pay out 129900 kop: only 29900 kop paid and not yet refunded",
          },
          { status: 409 },
        ),
      ),
    );
    renderBlock(["orders:read", "payments:refund"]);

    await user.click(
      await screen.findByRole("button", { name: m.payoutAction }),
    );
    const dialog = await screen.findByRole("dialog", { name: m.payoutTitle });
    expect(
      within(dialog).queryByRole("radio", {
        name: m.payoutMethods.LIQPAY_REFUND,
      }),
    ).not.toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: /^Повернути/ }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      text(m.errors.exceedsPaid(formatKop(29900))),
    );
  });
});

describe("OrderPaymentBlock — сторно and void (payments:correct)", () => {
  const ENTRY = makeEntry({ id: "e-cash" });
  const NAME = /^Сторнувати «Оплата на точці/;

  it("requires a reason, then reverses the entry with the lock token", async () => {
    const user = userEvent.setup();
    serveMoney(makeMoney({ entries: [ENTRY] }));
    const calls: Array<{ entryId: string; body: Record<string, unknown> }> = [];
    server.use(
      http.post(
        "*/api/admin/orders/:orderId/money/entries/:entryId/reversal",
        async ({ params, request }) => {
          calls.push({
            entryId: String(params.entryId),
            body: (await request.json()) as Record<string, unknown>,
          });
          return HttpResponse.json({ data: makeMoney() });
        },
      ),
    );
    renderBlock();

    await user.click(await screen.findByRole("button", { name: NAME }));
    const dialog = await screen.findByRole("dialog", { name: m.reverseTitle });
    await user.click(
      within(dialog).getByRole("button", { name: m.reverseSubmit }),
    );
    expect(await within(dialog).findByText(m.reasonRequired)).toBeVisible();
    expect(calls).toHaveLength(0);

    await user.type(
      within(dialog).getByLabelText(m.reasonLabel),
      "Записали не те замовлення",
    );
    await user.click(
      within(dialog).getByRole("button", { name: m.reverseSubmit }),
    );

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      entryId: "e-cash",
      body: {
        reason: "Записали не те замовлення",
        expectedUpdatedAt: UPDATED_AT,
      },
    });
    expect(toast.success).toHaveBeenCalledWith(m.reverseToast);
  });

  it("offers no сторно on LiqPay rows, reversals or reversed rows", async () => {
    serveMoney(
      makeMoney({
        entries: [
          makeEntry({ id: "e-lp", kind: "LIQPAY_PAYMENT", actorName: null }),
          makeEntry({ id: "e-1", reversedById: "e-2" }),
          makeEntry({ id: "e-2", reversalOfId: "e-1" }),
        ],
      }),
    );
    renderBlock();

    await screen.findAllByTestId("money-entry");
    expect(
      screen.queryByRole("button", { name: /^Сторнувати/ }),
    ).not.toBeInTheDocument();
  });

  it("voids a LiqPay refund still awaiting confirmation, with a reason", async () => {
    const user = userEvent.setup();
    serveMoney(
      makeMoney({
        entries: [
          makeEntry({
            id: "e-req",
            direction: "OUT",
            kind: "LIQPAY_REFUND",
            providerState: "REQUESTED",
          }),
        ],
      }),
    );
    const calls: string[] = [];
    server.use(
      http.post(
        "*/api/admin/orders/:orderId/money/entries/:entryId/void",
        ({ params }) => {
          calls.push(String(params.entryId));
          return HttpResponse.json({ data: makeMoney() });
        },
      ),
    );
    renderBlock();

    await user.click(
      await screen.findByRole("button", { name: /^Анулювати запит/ }),
    );
    const dialog = await screen.findByRole("dialog", { name: m.voidTitle });
    await user.type(
      within(dialog).getByLabelText(m.reasonLabel),
      "LiqPay відмовив",
    );
    await user.click(
      within(dialog).getByRole("button", { name: m.voidSubmit }),
    );

    await waitFor(() => expect(calls).toEqual(["e-req"]));
  });
});

describe("OrderPaymentBlock — permissions", () => {
  const MONEY = makeMoney({
    orderStatus: "CANCELLED",
    paymentMethod: "ONLINE",
    totals: { paidKop: 129900, balanceKop: -129900 },
    outWithoutReturnMaxKop: 129900,
    entries: [makeEntry()],
  });

  it("shows a reader the summary and the journal, and no control at all", async () => {
    serveMoney(MONEY);
    renderBlock(["orders:read"]);

    await summary();
    expect(screen.getAllByTestId("money-entry")).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("gives each action to its own grant", async () => {
    serveMoney(MONEY);
    const { unmount } = renderBlock(["orders:read", "orders:write"]);
    expect(
      await screen.findByRole("button", { name: m.receiptAction }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: m.payoutAction }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Сторнувати/ }),
    ).not.toBeInTheDocument();
    unmount();

    renderBlock(["orders:read", "payments:refund", "payments:correct"]);
    expect(
      await screen.findByRole("button", { name: m.payoutAction }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Сторнувати/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: m.receiptAction }),
    ).not.toBeInTheDocument();
  });
});

describe("OrderPaymentBlock — LiqPay attempts, folded", () => {
  it("keeps the attempts collapsed and unfetched until asked", async () => {
    const user = userEvent.setup();
    serveMoney(makeMoney({ paymentMethod: "ONLINE" }));
    let attemptReads = 0;
    server.use(
      http.get("*/api/admin/payments/orders/:orderId", () => {
        attemptReads += 1;
        return HttpResponse.json({ data: [] });
      }),
    );
    renderBlock(["orders:read", "payments:read"]);

    const toggle = await screen.findByRole("button", { name: m.attemptsShow });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(attemptReads).toBe(0);

    await user.click(toggle);
    expect(
      screen.getByRole("button", { name: m.attemptsHide }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      await screen.findByText(dict.orders.paymentAttemptsEmpty),
    ).toBeInTheDocument();
    expect(attemptReads).toBe(1);
  });

  it("has no attempts toggle on a cash order or without payments:read", async () => {
    serveMoney(makeMoney({ paymentMethod: "ON_DELIVERY" }));
    const { unmount } = renderBlock(["orders:read", "payments:read"]);
    await summary();
    expect(
      screen.queryByRole("button", { name: m.attemptsShow }),
    ).not.toBeInTheDocument();
    unmount();

    serveMoney(makeMoney({ paymentMethod: "ONLINE" }));
    renderBlock(["orders:read"]);
    await summary();
    expect(
      screen.queryByRole("button", { name: m.attemptsShow }),
    ).not.toBeInTheDocument();
  });
});
