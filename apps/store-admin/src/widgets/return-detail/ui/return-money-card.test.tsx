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
import type { ReturnEntity } from "@/entities/return";
import { ReturnMoneyCard } from "./return-money-card";

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

/**
 * «Гроші за заявкою» (R2, TASK-2046): the money of one REFUND return, read
 * from the order money journal and moved through it — «Зменшити» the credit,
 * «Виплатити» in parts, «Сторнувати» a payout.
 */

const r = dict.returnMoney;
const m = dict.orderMoney;
const RETURN_ID = "return-uuid-1";
const ORDER_ID = "order-uuid-1";
const UPDATED_AT = "2026-10-30T12:00:00.000Z";

const plain = (value: string) => value.replace(/[  ]/g, " ");
const text = (value: string) =>
  new RegExp(
    plain(value)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/ /g, "\\s"),
  );

function makeReturn(overrides: Partial<ReturnEntity> = {}): ReturnEntity {
  return {
    id: RETURN_ID,
    orderId: ORDER_ID,
    status: "RECEIVED",
    reason: null,
    requestedAt: "2026-10-20T10:00:00.000Z",
    resolvedAt: null,
    restockedAt: null,
    refundedAmount: "100.00",
    paidOutKop: 10000,
    creditKop: 79900,
    creditReason: null,
    requestedOutcome: "REFUND",
    channel: "ACCOUNT",
    decision: "REFUND",
    decisionReason: null,
    decidedAt: "2026-10-21T10:00:00.000Z",
    decisionLegacy: false,
    items: [],
    ...overrides,
  };
}

function makePayout(overrides: Record<string, unknown> = {}) {
  return {
    id: "payout-1",
    direction: "OUT",
    kind: "CASH_REFUND",
    amountKop: 10000,
    returnId: RETURN_ID,
    paymentId: null,
    providerState: null,
    actorId: "admin-1",
    actorName: "Ірина Коваль",
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

/** AD-RET-17: paid 2 397, a 799 return, 100 of it paid out in cash. */
function makeMoney(overrides: Record<string, unknown> = {}) {
  const { totals, returns, ...rest } = overrides as {
    totals?: Record<string, number>;
    returns?: Array<Record<string, unknown>>;
  };
  return {
    orderId: ORDER_ID,
    orderStatus: "DELIVERED",
    paymentStatus: "PARTIALLY_REFUNDED",
    paymentMethod: "ONLINE",
    deliveryMethod: "NOVA_POSHTA",
    updatedAt: UPDATED_AT,
    entries: [makePayout()],
    allowedInKinds: ["COD_NOVA_POSHTA", "BANK_TRANSFER"],
    refundablePayments: null,
    outWithoutReturnMaxKop: 0,
    returns: returns ?? [
      {
        returnId: RETURN_ID,
        status: "RECEIVED",
        creditKop: 79900,
        creditReason: null,
        paidOutKop: 10000,
        owedKop: 69900,
      },
    ],
    ...rest,
    totals: {
      totalKop: 239700,
      paidKop: 239700,
      refundedKop: 10000,
      returnCreditKop: 79900,
      balanceKop: -69900,
      ...totals,
    },
  };
}

function serveMoney(money: Record<string, unknown>) {
  server.use(
    http.get("*/api/admin/orders/:orderId/money", () =>
      HttpResponse.json({ data: money }),
    ),
  );
}

const ALL = [
  "orders:read",
  "returns:read",
  "returns:write",
  "payments:refund",
  "payments:correct",
];

function renderCard(
  rma: ReturnEntity = makeReturn(),
  permissions: string[] = ALL,
) {
  return renderWithProviders(<ReturnMoneyCard rma={rma} />, {
    auth: { permissions },
  });
}

const card = () => screen.findByRole("region", { name: r.heading });

beforeEach(() => {
  jest.mocked(toast.success).mockClear();
  jest.mocked(toast.error).mockClear();
});

describe("ReturnMoneyCard — what is owed and what went out (TASK-2046)", () => {
  it("shows «До повернення», «Виплачено», «Винні покупцю» and the payout list", async () => {
    serveMoney(makeMoney());
    renderCard();

    const region = await card();
    expect(within(region).getByTestId("return-credit")).toHaveTextContent(
      text(formatKop(79900)),
    );
    expect(region).toHaveTextContent(text(formatKop(10000)));
    expect(
      await within(region).findByTestId("return-money-due"),
    ).toHaveTextContent(text(r.owedToCustomer(formatKop(69900))));

    const payouts = within(region).getAllByTestId("return-payout");
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toHaveTextContent(m.payoutMethods.CASH_REFUND);
    expect(payouts[0]).toHaveTextContent("Ірина Коваль");
    expect(
      within(region).getByRole("button", { name: m.payoutForReturnAction }),
    ).toBeInTheDocument();
  });

  it("lists only THIS return's payouts — not another return's, not a receipt", async () => {
    serveMoney(
      makeMoney({
        entries: [
          makePayout(),
          makePayout({ id: "other", returnId: "return-uuid-2" }),
          makePayout({
            id: "in",
            direction: "IN",
            kind: "PAID_AT_POINT",
            returnId: null,
          }),
        ],
      }),
    );
    renderCard();

    const region = await card();
    await waitFor(() =>
      expect(within(region).getAllByTestId("return-payout")).toHaveLength(1),
    );
  });

  it("marks a reversed payout and a LiqPay refund awaiting confirmation", async () => {
    serveMoney(
      makeMoney({
        entries: [
          makePayout({ reversedById: "rev-1" }),
          makePayout({
            id: "rev-1",
            reversalOfId: "payout-1",
            reason: "Помилка каси",
          }),
          makePayout({
            id: "liqpay-1",
            kind: "LIQPAY_REFUND",
            providerState: "REQUESTED",
            actorName: null,
            paymentId: "pay-1",
          }),
        ],
      }),
    );
    renderCard();

    const region = await card();
    const rows = await within(region).findAllByTestId("return-payout");
    // The reversal is not a row of its own: the payout stays, struck through.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(r.reversedChip);
    expect(rows[1]).toHaveTextContent(m.requestedChip);
    expect(rows[1]).toHaveTextContent(m.payoutMethods.LIQPAY_REFUND);
    // A reversed row and a LiqPay row offer no «Сторнувати».
    expect(
      within(rows[0]).queryByRole("button", { name: /Сторнувати/ }),
    ).not.toBeInTheDocument();
  });

  it("offers «Сторнувати» on a cash payout to payments:correct", async () => {
    serveMoney(makeMoney());
    renderCard();

    const region = await card();
    const [row] = await within(region).findAllByTestId("return-payout");
    expect(
      within(row).getByRole("button", { name: /^Сторнувати «/ }),
    ).toBeInTheDocument();
  });

  it("says an unpaid order returns goods, not money — and offers no payout", async () => {
    serveMoney(
      makeMoney({
        entries: [],
        paymentStatus: "PENDING",
        totals: { paidKop: 0, refundedKop: 0, balanceKop: 159800 },
        returns: [
          {
            returnId: RETURN_ID,
            status: "RECEIVED",
            creditKop: 79900,
            creditReason: null,
            paidOutKop: 0,
            owedKop: 79900,
          },
        ],
      }),
    );
    renderCard(makeReturn({ paidOutKop: 0, refundedAmount: null }));

    const region = await card();
    expect(await within(region).findByText(r.unpaidOrder)).toBeInTheDocument();
    expect(
      within(region).queryByText(text(r.owedToCustomer(""))),
    ).not.toBeInTheDocument();
    expect(
      within(region).queryByRole("button", { name: m.payoutForReturnAction }),
    ).not.toBeInTheDocument();
  });

  it("says nothing is due once the return is paid out", async () => {
    serveMoney(
      makeMoney({
        entries: [makePayout({ amountKop: 79900 })],
        returns: [
          {
            returnId: RETURN_ID,
            status: "REFUNDED",
            creditKop: 79900,
            creditReason: null,
            paidOutKop: 79900,
            owedKop: 0,
          },
        ],
      }),
    );
    renderCard(makeReturn({ status: "REFUNDED", paidOutKop: 79900 }));

    const region = await card();
    await within(region).findAllByTestId("return-payout");
    expect(
      within(region).queryByTestId("return-money-due"),
    ).not.toBeInTheDocument();
    // Nothing left to lower either: the credit equals what was paid out.
    expect(
      within(region).queryByRole("button", { name: r.reduceActionAria }),
    ).not.toBeInTheDocument();
  });

  it("before the goods arrive shows the credit and why nothing can go out yet", async () => {
    serveMoney(makeMoney({ entries: [] }));
    renderCard(makeReturn({ status: "APPROVED", paidOutKop: 0 }));

    const region = await card();
    expect(within(region).getByText(r.awaitingGoods)).toBeInTheDocument();
    expect(
      within(region).queryByRole("button", { name: m.payoutForReturnAction }),
    ).not.toBeInTheDocument();
  });

  it("draws nothing for a return that is not a refund", () => {
    serveMoney(makeMoney());
    renderCard(makeReturn({ decision: "REPAIR", creditKop: null }));
    expect(
      screen.queryByRole("region", { name: r.heading }),
    ).not.toBeInTheDocument();
  });

  it("shows why the credit was lowered", async () => {
    serveMoney(
      makeMoney({
        returns: [
          {
            returnId: RETURN_ID,
            status: "RECEIVED",
            creditKop: 50000,
            creditReason: "Подряпина на корпусі",
            paidOutKop: 10000,
            owedKop: 40000,
          },
        ],
      }),
    );
    renderCard();

    expect(
      await screen.findByText(r.creditReason("Подряпина на корпусі")),
    ).toBeInTheDocument();
  });
});

describe("ReturnMoneyCard — «Виплатити» in parts (TASK-2046)", () => {
  function stubPayout() {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(
        "*/api/admin/orders/:orderId/money/out",
        async ({ request }) => {
          bodies.push((await request.json()) as Record<string, unknown>);
          return HttpResponse.json(
            {
              data: makeMoney({
                entries: [
                  makePayout(),
                  makePayout({ id: "p2", amountKop: 30050 }),
                ],
                totals: { refundedKop: 40050, balanceKop: -39850 },
                returns: [
                  {
                    returnId: RETURN_ID,
                    status: "RECEIVED",
                    creditKop: 79900,
                    creditReason: null,
                    paidOutKop: 40050,
                    owedKop: 39850,
                  },
                ],
              }),
            },
            { status: 201 },
          );
        },
      ),
    );
    return bodies;
  }

  it("prefills what is due, sends returnId and an integer amountKop", async () => {
    serveMoney(makeMoney());
    const bodies = stubPayout();
    const user = userEvent.setup();
    renderCard();

    await user.click(
      await screen.findByRole("button", { name: m.payoutForReturnAction }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: m.payoutForReturnTitle,
    });
    const amount = within(dialog).getByLabelText(m.amountLabel);
    expect(amount).toHaveValue("699");

    await user.clear(amount);
    await user.type(amount, "300,50");
    await user.click(
      within(dialog).getByRole("button", { name: /^Виплатити/ }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      kind: "CASH_REFUND",
      amountKop: 30050,
      returnId: RETURN_ID,
      reason: null,
      expectedUpdatedAt: UPDATED_AT,
    });
    expect(Number.isInteger(bodies[0].amountKop)).toBe(true);
    expect(toast.success).toHaveBeenCalledWith(m.payoutToast);
    // The fresh payload replaces the card's numbers — the rest is still owed.
    expect(
      await screen.findByText(text(r.owedToCustomer(formatKop(39850)))),
    ).toBeInTheDocument();
  });

  it("refuses more than is due before it reaches the server", async () => {
    serveMoney(makeMoney());
    const bodies = stubPayout();
    const user = userEvent.setup();
    renderCard();

    await user.click(
      await screen.findByRole("button", { name: m.payoutForReturnAction }),
    );
    const dialog = await screen.findByRole("dialog");
    const amount = within(dialog).getByLabelText(m.amountLabel);
    await user.clear(amount);
    await user.type(amount, "700");
    await user.click(
      within(dialog).getByRole("button", { name: /^Виплатити/ }),
    );

    expect(
      await within(dialog).findByText(m.amountTooLarge(formatKop(69900))),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("caps the payout by what the order still holds, not only by the credit", async () => {
    // Paid 500 of the order, nothing refunded: a 799 return can get 500 back.
    serveMoney(
      makeMoney({
        entries: [],
        totals: { paidKop: 50000, refundedKop: 0, balanceKop: 109800 },
        returns: [
          {
            returnId: RETURN_ID,
            status: "RECEIVED",
            creditKop: 79900,
            creditReason: null,
            paidOutKop: 0,
            owedKop: 79900,
          },
        ],
      }),
    );
    renderCard(makeReturn({ paidOutKop: 0 }));

    expect(
      await screen.findByText(text(r.owedToCustomer(formatKop(50000)))),
    ).toBeInTheDocument();
  });

  it.each([
    [
      "without payments:refund",
      ["orders:read", "returns:read", "returns:write"],
    ],
    [
      "without returns:write",
      ["orders:read", "returns:read", "payments:refund"],
    ],
  ])(
    "offers no «Виплатити» %s — the server needs both",
    async (_what, permissions) => {
      serveMoney(makeMoney());
      renderCard(makeReturn(), permissions);

      const region = await card();
      await within(region).findByTestId("return-money-due");
      expect(
        within(region).queryByRole("button", { name: m.payoutForReturnAction }),
      ).not.toBeInTheDocument();
    },
  );

  it("shows the return's own figures, without the journal, to a reader without orders:read", async () => {
    let moneyReads = 0;
    server.use(
      http.get("*/api/admin/orders/:orderId/money", () => {
        moneyReads += 1;
        return HttpResponse.json({ data: makeMoney() });
      }),
    );
    renderCard(makeReturn(), ["returns:read", "returns:write"]);

    const region = await card();
    expect(within(region).getByTestId("return-credit")).toHaveTextContent(
      text(formatKop(79900)),
    );
    expect(within(region).getByText(r.payoutsNoAccess)).toBeInTheDocument();
    expect(moneyReads).toBe(0);
  });
});

describe("ReturnMoneyCard — «Зменшити» «До повернення» (TASK-2046)", () => {
  function stubReduce() {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.patch(
        "*/api/admin/returns/:returnId/credit",
        async ({ request }) => {
          bodies.push((await request.json()) as Record<string, unknown>);
          return HttpResponse.json({
            data: makeReturn({ creditKop: 50000, creditReason: "Подряпина" }),
          });
        },
      ),
    );
    return bodies;
  }

  async function openReduce() {
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: r.reduceActionAria }),
    );
    const dialog = await screen.findByRole("dialog", { name: r.reduceTitle });
    return {
      user,
      dialog,
      amount: within(dialog).getByLabelText(r.reduceAmountLabel),
      // By role: the required label carries an aria-hidden « *».
      reason: within(dialog).getByRole("textbox", {
        name: r.reduceReasonLabel,
      }),
      submit: () =>
        user.click(within(dialog).getByRole("button", { name: /^Зменшити/ })),
    };
  }

  it("prefills the current amount and refuses to raise it", async () => {
    serveMoney(makeMoney());
    const bodies = stubReduce();
    renderCard();

    const { user, dialog, amount, reason, submit } = await openReduce();
    expect(amount).toHaveValue("799");
    await user.clear(amount);
    await user.type(amount, "800");
    await user.type(reason, "Подряпина");
    await submit();

    expect(
      await within(dialog).findByText(r.reduceAboveCurrent(formatKop(79900))),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("refuses less than was already paid out", async () => {
    serveMoney(makeMoney());
    const bodies = stubReduce();
    renderCard();

    const { user, dialog, amount, reason, submit } = await openReduce();
    await user.clear(amount);
    await user.type(amount, "99");
    await user.type(reason, "Подряпина");
    await submit();

    expect(
      await within(dialog).findByText(r.reduceBelowPaidOut(formatKop(10000))),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("requires a reason", async () => {
    serveMoney(makeMoney());
    const bodies = stubReduce();
    renderCard();

    const { user, dialog, amount, submit } = await openReduce();
    await user.clear(amount);
    await user.type(amount, "500");
    await submit();

    expect(
      await within(dialog).findByText(m.reasonRequired),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("sends the lower amount in integer kopecks with the trimmed reason", async () => {
    serveMoney(makeMoney());
    const bodies = stubReduce();
    renderCard();

    const { user, amount, reason, submit } = await openReduce();
    await user.clear(amount);
    await user.type(amount, "500");
    await user.type(reason, "  Подряпина  ");
    await submit();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ creditKop: 50000, reason: "Подряпина" });
    expect(toast.success).toHaveBeenCalledWith(r.reduceToast);
  });

  it("says what moved and re-reads when a payout landed meanwhile", async () => {
    serveMoney(makeMoney());
    server.use(
      http.patch("*/api/admin/returns/:returnId/credit", () =>
        HttpResponse.json(
          {
            error: "RETURN_CREDIT_BELOW_PAID_OUT",
            message: "Credit below paid out",
            statusCode: 409,
          },
          { status: 409 },
        ),
      ),
    );
    renderCard();

    const { user, amount, reason, submit } = await openReduce();
    await user.clear(amount);
    await user.type(amount, "500");
    await user.type(reason, "Подряпина");
    await submit();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        dict.returns.refusalCreditBelowPaidOut,
      ),
    );
  });

  it("offers no «Зменшити» without returns:write", async () => {
    serveMoney(makeMoney());
    renderCard(makeReturn(), [
      "orders:read",
      "returns:read",
      "payments:refund",
    ]);

    await card();
    expect(
      screen.queryByRole("button", { name: r.reduceActionAria }),
    ).not.toBeInTheDocument();
  });
});
