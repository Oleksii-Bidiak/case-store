import type { ReactElement } from "react";
import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import type { ReturnEntity } from "@/entities/return";
import { ReturnResolveForm } from "./return-resolve-form";

const d = dict.returns;

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
});

/**
 * TASK-716: the actions exist only for a session holding `returns:write`, so
 * every behavioural test renders one. The refusal is its own describe below.
 */
const WRITER = { permissions: ["returns:read", "returns:write"] };
const renderAsWriter = (ui: ReactElement) =>
  renderWithProviders(ui, { auth: WRITER });

function makeReturn(overrides: Partial<ReturnEntity> = {}): ReturnEntity {
  return {
    id: "return-uuid-1234",
    orderId: "order-uuid-1234",
    status: "APPROVED",
    reason: "Не підійшов розмір",
    operatorNotes: null,
    requestedAt: "2026-07-01T10:00:00.000Z",
    resolvedAt: null,
    restockedAt: null,
    refundedAmount: null,
    requestedOutcome: "REFUND",
    channel: "ACCOUNT",
    // An approved return under a REFUND decision unless a test says otherwise.
    decision: "REFUND",
    decisionReason: null,
    decidedAt: "2026-07-02T10:00:00.000Z",
    decisionLegacy: false,
    // Two units at 499.00: the refund ceiling (TASK-785) is 998.00, so a 499.00
    // refund is the partial one the money tests below send.
    items: [
      {
        id: "return-item-1",
        orderItemId: "order-item-1",
        quantity: 2,
        productName: "Чохол iPhone 15",
        price: "499.00",
      },
    ],
    ...overrides,
  };
}

/** Stub the resolve PATCH, capturing the body the client actually sent. */
function stubResolve(respond: () => Response | Promise<Response>) {
  const bodies: Array<Record<string, unknown>> = [];
  server.use(
    http.patch("*/api/admin/returns/:returnId", async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return respond();
    }),
  );
  return bodies;
}

const nextStep = () => screen.getByRole("region", { name: d.resolveHeading });

describe("ReturnResolveForm — one «Наступний крок» per status (TASK-1056)", () => {
  /**
   * TASK-2044 — APPROVED and REJECTED come from a decision
   * (`features/return-decide`), never from this card: the PATCH answers them
   * with RETURN_USE_DECISION_ENDPOINT.
   */
  it("offers no step on a fresh request — the decision comes first", () => {
    renderAsWriter(
      <ReturnResolveForm
        rma={makeReturn({ status: "REQUESTED", decision: null })}
      />,
    );

    const card = within(nextStep());
    expect(card.getByText(d.nextRequested)).toBeInTheDocument();
    expect(card.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(d.resolveRefundedAmount),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("never sends APPROVED or REJECTED from any status", async () => {
    const bodies = stubResolve(() => HttpResponse.json({ data: makeReturn() }));
    for (const status of [
      "REQUESTED",
      "APPROVED",
      "RECEIVED",
      "REJECTED",
    ] as const) {
      const { unmount } = renderAsWriter(
        <ReturnResolveForm rma={makeReturn({ status })} />,
      );
      for (const button of within(nextStep()).queryAllByRole("button")) {
        expect(button).not.toHaveTextContent(/Схвалити|Відхилити/);
      }
      unmount();
    }
    expect(bodies).toHaveLength(0);
  });

  it("offers «Товар отримано» after a decision of any kind", () => {
    for (const decision of ["REFUND", "REPLACEMENT", "REPAIR"] as const) {
      const { unmount } = renderAsWriter(
        <ReturnResolveForm rma={makeReturn({ decision })} />,
      );
      expect(
        within(nextStep()).getByRole("button", { name: d.markReceived }),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("offers «Гроші повернуто» only under a REFUND decision", () => {
    renderAsWriter(
      <ReturnResolveForm
        rma={makeReturn({ status: "RECEIVED", decision: "REPAIR" })}
      />,
    );

    expect(
      within(nextStep()).getByText(d.nextReceivedNoRefund(d.decisionREPAIR)),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: d.markRefunded }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(d.resolveRefundedAmount, { exact: false }),
    ).not.toBeInTheDocument();
  });

  it("points a refused request at the decision instead of offering a step", () => {
    renderAsWriter(
      <ReturnResolveForm
        rma={makeReturn({ status: "REJECTED", decision: "REJECT" })}
      />,
    );
    expect(screen.getByText(d.nextRejected)).toBeInTheDocument();
    expect(within(nextStep()).queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers no control at all once the money went back", () => {
    renderAsWriter(
      <ReturnResolveForm rma={makeReturn({ status: "REFUNDED" })} />,
    );
    expect(screen.getByText(d.resolveNoTransitions)).toBeInTheDocument();
    expect(within(nextStep()).queryByRole("button")).not.toBeInTheDocument();
  });

  it("says «Рішення збережено» after a step", async () => {
    stubResolve(() =>
      HttpResponse.json({ data: makeReturn({ status: "RECEIVED" }) }),
    );
    renderAsWriter(<ReturnResolveForm rma={makeReturn()} />);

    await userEvent.click(screen.getByRole("button", { name: d.markReceived }));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(d.resolveSuccess),
    );
  });
});

describe("ReturnResolveForm — the refund step from the keyboard", () => {
  it("records «Гроші повернуто» on Enter in the amount field", async () => {
    const bodies = stubResolve(() =>
      HttpResponse.json({ data: makeReturn({ status: "REFUNDED" }) }),
    );
    renderAsWriter(
      <ReturnResolveForm rma={makeReturn({ status: "RECEIVED" })} />,
    );

    await userEvent.type(
      screen.getByLabelText(d.resolveRefundedAmount, { exact: false }),
      "250{Enter}",
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      status: "REFUNDED",
      refundedAmount: "250",
    });
  });
});

describe("ReturnResolveForm — the restock question (TASK-340)", () => {
  it("asks it only at «Товар отримано», ticked by default (Р3)", () => {
    renderAsWriter(<ReturnResolveForm rma={makeReturn()} />);

    const box = screen.getByRole("checkbox", { name: d.restockUnits(2) });
    expect(box).toBeChecked();
    expect(screen.getByText(d.resolveRestockHint)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: d.markReceived }),
    ).toBeInTheDocument();
  });

  it("sends restock: true when it stays ticked", async () => {
    const bodies = stubResolve(() =>
      HttpResponse.json({ data: makeReturn({ status: "RECEIVED" }) }),
    );
    renderAsWriter(<ReturnResolveForm rma={makeReturn()} />);

    await userEvent.click(screen.getByRole("button", { name: d.markReceived }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ status: "RECEIVED", restock: true });
  });

  it("omits `restock` from the body once the operator unticks it", async () => {
    const bodies = stubResolve(() =>
      HttpResponse.json({ data: makeReturn({ status: "RECEIVED" }) }),
    );
    renderAsWriter(<ReturnResolveForm rma={makeReturn()} />);

    await userEvent.click(
      screen.getByRole("checkbox", { name: d.restockUnits(2) }),
    );
    await userEvent.click(screen.getByRole("button", { name: d.markReceived }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty("restock");
    expect(bodies[0].status).toBe("RECEIVED");
  });

  it("refuses to offer a second restock once the goods were already credited", () => {
    renderAsWriter(
      <ReturnResolveForm
        rma={makeReturn({ restockedAt: "2026-07-05T09:00:00.000Z" })}
      />,
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(d.resolveRestockAlreadyDone)).toBeInTheDocument();
  });
});

describe("ReturnResolveForm — the refund step and its ceiling (TASK-785, TASK-959)", () => {
  const received = () => makeReturn({ status: "RECEIVED" });

  const typeAndRefund = async (amount: string) => {
    const field = screen.getByLabelText(d.resolveRefundedAmount, {
      exact: false,
    });
    await userEvent.clear(field);
    await userEvent.type(field, amount);
    await userEvent.click(screen.getByRole("button", { name: d.markRefunded }));
  };

  it("shows the amount only on the refund step, with the ceiling in its hint", () => {
    renderAsWriter(
      <ReturnResolveForm rma={received()} orderBalance="1299.00" />,
    );

    expect(
      screen.getByLabelText(d.resolveRefundedAmount, { exact: false }),
    ).toBeRequired();
    expect(
      screen.getByText(d.refundCapHint(formatCurrency("998.00"))),
    ).toBeInTheDocument();
  });

  it("refuses an empty amount — «Гроші повернуто» without a sum says nothing", async () => {
    const bodies = stubResolve(() => HttpResponse.json({ data: received() }));
    renderAsWriter(<ReturnResolveForm rma={received()} />);

    await userEvent.click(screen.getByRole("button", { name: d.markRefunded }));

    expect(
      await screen.findByText(d.resolveRefundedAmountRequired),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("rejects a malformed refund amount before it reaches the server", async () => {
    const bodies = stubResolve(() => HttpResponse.json({ data: received() }));
    renderAsWriter(<ReturnResolveForm rma={received()} />);

    await typeAndRefund("499,00");

    expect(
      await screen.findByText(d.resolveRefundedAmountInvalid),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("sends a partial refund through as the decimal string it is", async () => {
    const bodies = stubResolve(() =>
      HttpResponse.json({ data: makeReturn({ status: "REFUNDED" }) }),
    );
    renderAsWriter(<ReturnResolveForm rma={received()} />);

    await typeAndRefund("499.00");

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      status: "REFUNDED",
      refundedAmount: "499.00",
    });
    expect(bodies[0]).not.toHaveProperty("restock");
  });

  it("refuses 49900 typed for 499.00 under the field", async () => {
    const bodies = stubResolve(() => HttpResponse.json({ data: received() }));
    renderAsWriter(<ReturnResolveForm rma={received()} />);

    await typeAndRefund("49900");

    // Compared on raw textContent: the currency's non-breaking space does not
    // survive the query's whitespace normalisation.
    const error = await screen.findByText(/вартість позицій/);
    expect(error.textContent).toBe(
      d.resolveRefundExceedsReturnedValue(formatCurrency("998.00")),
    );
    expect(
      screen.getByLabelText(d.resolveRefundedAmount, { exact: false }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(bodies).toHaveLength(0);
  });

  it("enforces what the order has left when the card knows it (TASK-959)", async () => {
    const bodies = stubResolve(() => HttpResponse.json({ data: received() }));
    renderAsWriter(
      <ReturnResolveForm rma={received()} orderBalance="400.00" />,
    );

    expect(
      screen.getByText(d.refundCapHint(formatCurrency("400.00"))),
    ).toBeInTheDocument();
    await typeAndRefund("450.00");

    const error = await screen.findByText(/можна повернути за цим замовленням/);
    expect(error.textContent).toBe(
      d.resolveRefundExceedsOrderBalance(formatCurrency("400.00")),
    );
    expect(bodies).toHaveLength(0);
  });

  it("lets the full value of the returned lines through", async () => {
    const bodies = stubResolve(() =>
      HttpResponse.json({ data: makeReturn({ status: "REFUNDED" }) }),
    );
    renderAsWriter(<ReturnResolveForm rma={received()} />);

    await typeAndRefund("998.00");

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].refundedAmount).toBe("998.00");
  });

  // The order-balance ceiling may be unknown to the card (no orders:read), so
  // the server is then its only judge; its refusal belongs under the amount.
  it("puts the server's order-balance refusal under the amount field", async () => {
    stubResolve(() =>
      HttpResponse.json(
        {
          error: "RETURN_REFUND_EXCEEDS_ORDER_BALANCE",
          message:
            "Refund of 499.00 exceeds what is left to refund on this order (400.00)",
          statusCode: 400,
        },
        { status: 400 },
      ),
    );
    renderAsWriter(<ReturnResolveForm rma={received()} />);

    await typeAndRefund("499.00");

    expect(
      await screen.findByText(d.resolveRefundExceedsOrderBalance()),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(d.resolveRefundedAmount, { exact: false }),
    ).toHaveAttribute("aria-invalid", "true");
  });

  it("spins and blocks a second click while the refund is saving (Р5)", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const bodies = stubResolve(async () => {
      await gate;
      return HttpResponse.json({ data: makeReturn({ status: "REFUNDED" }) });
    });
    renderAsWriter(<ReturnResolveForm rma={received()} />);

    await typeAndRefund("499.00");

    const saving = await screen.findByRole("button", { name: d.saving });
    expect(saving).toBeDisabled();
    release();
    await waitFor(() => expect(bodies).toHaveLength(1));
  });
});

/**
 * TASK-956 — every 400 but the two ceiling codes used to say «Повернення товару
 * на склад доступне лише для статусу…», whatever was actually wrong.
 */
describe("ReturnResolveForm — 400 texts (TASK-956)", () => {
  it("puts a DTO refusal of the notes under the notes field", async () => {
    stubResolve(() =>
      HttpResponse.json(
        {
          error: "Bad Request",
          message: [
            "operatorNotes must be shorter than or equal to 2000 characters",
          ],
          statusCode: 400,
        },
        { status: 400 },
      ),
    );
    renderAsWriter(<ReturnResolveForm rma={makeReturn()} />);

    await userEvent.click(screen.getByRole("button", { name: d.notesEdit }));
    await userEvent.type(screen.getByLabelText(d.operatorNotes), "x");
    await userEvent.click(screen.getByRole("button", { name: d.markReceived }));

    expect(await screen.findByText(d.operatorNotesTooLong)).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("says something true for any other 400 — not the restock sentence", async () => {
    stubResolve(() =>
      HttpResponse.json(
        { error: "Bad Request", message: "Something else", statusCode: 400 },
        { status: 400 },
      ),
    );
    renderAsWriter(<ReturnResolveForm rma={makeReturn()} />);

    await userEvent.click(screen.getByRole("button", { name: d.markReceived }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(d.resolveBadRequest),
    );
    expect(d.resolveBadRequest).not.toMatch(/склад/);
  });

  it("refetches and says so on a 409 — the server's state machine wins", async () => {
    stubResolve(() =>
      HttpResponse.json(
        { error: "Conflict", message: "moved", statusCode: 409 },
        { status: 409 },
      ),
    );
    renderAsWriter(<ReturnResolveForm rma={makeReturn()} />);

    await userEvent.click(screen.getByRole("button", { name: d.markReceived }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(d.resolveConflict),
    );
  });

  it("names a coded 409 instead of the generic «повернення змінилося» (TASK-1966)", async () => {
    stubResolve(() =>
      HttpResponse.json(
        {
          error: "RETURN_ALREADY_RESTOCKED",
          message:
            "These returned goods have already been credited back to inventory",
          statusCode: 409,
        },
        { status: 409 },
      ),
    );
    renderAsWriter(<ReturnResolveForm rma={makeReturn()} />);

    await userEvent.click(screen.getByRole("button", { name: d.markReceived }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(d.resolveRestockAlreadyDone),
    );
  });
});

describe("ReturnResolveForm — operator notes, shown once (TASK-794, TASK-1056)", () => {
  it("shows the notes once, read-only, until «Змінити»", () => {
    renderAsWriter(
      <ReturnResolveForm rma={makeReturn({ operatorNotes: "ТТН очікуємо" })} />,
    );

    expect(screen.getAllByText("ТТН очікуємо")).toHaveLength(1);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText(d.operatorNotesHint)).toBeInTheDocument();
  });

  it("stops typing at the DTO's limit", async () => {
    renderAsWriter(<ReturnResolveForm rma={makeReturn()} />);
    await userEvent.click(screen.getByRole("button", { name: d.notesEdit }));

    expect(screen.getByLabelText(d.operatorNotes)).toHaveAttribute(
      "maxLength",
      "2000",
    );
  });

  it("sends the edited note with the next step", async () => {
    const bodies = stubResolve(() =>
      HttpResponse.json({ data: makeReturn({ status: "RECEIVED" }) }),
    );
    renderAsWriter(<ReturnResolveForm rma={makeReturn()} />);

    await userEvent.click(screen.getByRole("button", { name: d.notesEdit }));
    await userEvent.type(screen.getByLabelText(d.operatorNotes), "Скло ціле");
    await userEvent.click(screen.getByRole("button", { name: d.markReceived }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].operatorNotes).toBe("Скло ціле");
  });

  it("says why an over-long note blocks the step", async () => {
    const bodies = stubResolve(() => HttpResponse.json({ data: makeReturn() }));
    renderAsWriter(<ReturnResolveForm rma={makeReturn()} />);

    await userEvent.click(screen.getByRole("button", { name: d.notesEdit }));
    // `maxLength` governs typing only; a value arriving another way still
    // meets the schema, and that refusal used to be silent.
    fireEvent.change(screen.getByLabelText(d.operatorNotes), {
      target: { value: "н".repeat(2001) },
    });
    await userEvent.click(screen.getByRole("button", { name: d.markReceived }));

    expect(await screen.findByText(d.operatorNotesTooLong)).toBeInTheDocument();
    expect(screen.getByLabelText(d.operatorNotes)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(bodies).toHaveLength(0);
  });
});

/**
 * Since approve/reject moved to POST /decision (TASK-1961/2044), a REQUESTED or
 * REJECTED return has no step for the notes to ride on — they are saved on
 * their own, by a notes-only PATCH (no status), on every status.
 */
describe("ReturnResolveForm — «Зберегти примітки» on every status", () => {
  const editNotes = async (text: string) => {
    await userEvent.click(screen.getByRole("button", { name: d.notesEdit }));
    const field = screen.getByLabelText(d.operatorNotes);
    await userEvent.clear(field);
    if (text) await userEvent.type(field, text);
  };

  it.each([
    ["REQUESTED", null],
    ["APPROVED", "REFUND"],
    ["RECEIVED", "REPAIR"],
    ["REJECTED", "REJECT"],
    ["REFUNDED", "REFUND"],
  ] as const)(
    "saves the notes alone on a %s return — no status in the body",
    async (status, decision) => {
      const bodies = stubResolve(() =>
        HttpResponse.json({
          data: makeReturn({ status, decision, operatorNotes: "Дзвонив" }),
        }),
      );
      renderAsWriter(
        <ReturnResolveForm rma={makeReturn({ status, decision })} />,
      );

      await editNotes("  Дзвонив ");
      await userEvent.click(screen.getByRole("button", { name: d.notesSave }));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toEqual({ operatorNotes: "Дзвонив" });
      await waitFor(() =>
        expect(toastSuccess).toHaveBeenCalledWith(d.notesSaved),
      );
      // The editor closes once the notes are saved.
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    },
  );

  it("clears the notes with null when the field is emptied", async () => {
    const bodies = stubResolve(() =>
      HttpResponse.json({ data: makeReturn({ status: "REJECTED" }) }),
    );
    renderAsWriter(
      <ReturnResolveForm
        rma={makeReturn({
          status: "REJECTED",
          decision: "REJECT",
          operatorNotes: "Стара нотатка",
        })}
      />,
    );

    await editNotes("");
    await userEvent.click(screen.getByRole("button", { name: d.notesSave }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ operatorNotes: null });
  });

  it("keeps an over-long note out of the request and says why", async () => {
    const bodies = stubResolve(() => HttpResponse.json({ data: makeReturn() }));
    renderAsWriter(
      <ReturnResolveForm
        rma={makeReturn({ status: "REQUESTED", decision: null })}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: d.notesEdit }));
    fireEvent.change(screen.getByLabelText(d.operatorNotes), {
      target: { value: "н".repeat(2001) },
    });
    await userEvent.click(screen.getByRole("button", { name: d.notesSave }));

    expect(await screen.findByText(d.operatorNotesTooLong)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("puts the server's refusal of the notes under the field", async () => {
    stubResolve(() =>
      HttpResponse.json(
        {
          error: "Bad Request",
          message: [
            "operatorNotes must be shorter than or equal to 2000 characters",
          ],
          statusCode: 400,
        },
        { status: 400 },
      ),
    );
    renderAsWriter(
      <ReturnResolveForm
        rma={makeReturn({ status: "REQUESTED", decision: null })}
      />,
    );

    await editNotes("x");
    await userEvent.click(screen.getByRole("button", { name: d.notesSave }));

    expect(await screen.findByText(d.operatorNotesTooLong)).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("says the notes were not saved when the server fails", async () => {
    stubResolve(() => HttpResponse.json({}, { status: 500 }));
    renderAsWriter(
      <ReturnResolveForm
        rma={makeReturn({ status: "REQUESTED", decision: null })}
      />,
    );

    await editNotes("x");
    await userEvent.click(screen.getByRole("button", { name: d.notesSave }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(d.notesSaveFailed),
    );
    // The text survives the failure, so a retry needs no retyping.
    expect(screen.getByLabelText(d.operatorNotes)).toHaveValue("x");
  });

  it("spins and blocks a second click while the notes are saving", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const bodies = stubResolve(async () => {
      await gate;
      return HttpResponse.json({ data: makeReturn() });
    });
    renderAsWriter(<ReturnResolveForm rma={makeReturn()} />);

    await editNotes("x");
    await userEvent.click(screen.getByRole("button", { name: d.notesSave }));

    const saving = await screen.findByRole("button", { name: d.saving });
    expect(saving).toBeDisabled();
    // The step's action waits too — one PATCH at a time.
    expect(screen.getByRole("button", { name: d.markReceived })).toBeDisabled();
    release();
    await waitFor(() => expect(bodies).toHaveLength(1));
  });
});

/**
 * TASK-716 — every action here is `PATCH /admin/returns/:id`, behind
 * `returns:write`. A manager holding only `returns:read` sees the step and the
 * notes, and one line saying it is view-only.
 */
describe("ReturnResolveForm — returns:write gate (TASK-716)", () => {
  it("renders no action for a session that may only read returns", () => {
    renderWithProviders(
      <ReturnResolveForm rma={makeReturn({ operatorNotes: "Нотатка" })} />,
      { auth: { permissions: ["returns:read"] } },
    );

    expect(screen.getByText(dict.common.viewOnly)).toBeInTheDocument();
    expect(screen.getByText("Нотатка")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders neither the actions nor the view-only line while the rights are loading", () => {
    renderWithProviders(<ReturnResolveForm rma={makeReturn()} />, {
      auth: { permissions: [], arePermissionsLoading: true },
    });

    expect(screen.queryByText(dict.common.viewOnly)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the step's actions for a session holding returns:write", () => {
    renderAsWriter(<ReturnResolveForm rma={makeReturn()} />);

    expect(
      screen.getByRole("button", { name: d.markReceived }),
    ).toBeInTheDocument();
    expect(screen.queryByText(dict.common.viewOnly)).not.toBeInTheDocument();
  });
});
