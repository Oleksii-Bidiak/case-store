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
  it("offers approve or reject on a fresh request — no amount, no restock", () => {
    renderAsWriter(
      <ReturnResolveForm rma={makeReturn({ status: "REQUESTED" })} />,
    );

    const card = within(nextStep());
    expect(card.getByRole("button", { name: d.approve })).toBeInTheDocument();
    expect(card.getByRole("button", { name: d.reject })).toBeInTheDocument();
    expect(
      screen.queryByLabelText(d.resolveRefundedAmount),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("approves with one click", async () => {
    const bodies = stubResolve(() =>
      HttpResponse.json({ data: makeReturn({ status: "APPROVED" }) }),
    );
    renderAsWriter(
      <ReturnResolveForm rma={makeReturn({ status: "REQUESTED" })} />,
    );

    await userEvent.click(screen.getByRole("button", { name: d.approve }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].status).toBe("APPROVED");
    expect(bodies[0]).not.toHaveProperty("restock");
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(d.resolveSuccess),
    );
  });

  it("asks before rejecting, and sends nothing on «Скасувати»", async () => {
    const bodies = stubResolve(() =>
      HttpResponse.json({ data: makeReturn({ status: "REJECTED" }) }),
    );
    renderAsWriter(
      <ReturnResolveForm rma={makeReturn({ status: "REQUESTED" })} />,
    );

    await userEvent.click(screen.getByRole("button", { name: d.reject }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(d.rejectConfirmTitle)).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );
    expect(bodies).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: d.reject }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: d.rejectConfirm,
      }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].status).toBe("REJECTED");
  });

  it("still allows a refusal after approval — goods can come back damaged", () => {
    renderAsWriter(<ReturnResolveForm rma={makeReturn()} />);
    expect(
      within(nextStep()).getByRole("button", { name: d.reject }),
    ).toBeInTheDocument();
  });

  it("offers no refusal once the goods are back (the state machine)", () => {
    renderAsWriter(
      <ReturnResolveForm rma={makeReturn({ status: "RECEIVED" })} />,
    );
    expect(
      screen.queryByRole("button", { name: d.reject }),
    ).not.toBeInTheDocument();
  });

  it("offers no control at all on a closed return", () => {
    for (const status of ["REFUNDED", "REJECTED"] as const) {
      const { unmount } = renderAsWriter(
        <ReturnResolveForm rma={makeReturn({ status })} />,
      );
      expect(screen.getByText(d.resolveNoTransitions)).toBeInTheDocument();
      expect(within(nextStep()).queryByRole("button")).not.toBeInTheDocument();
      unmount();
    }
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

  it("offers no «Змінити» on a closed return — the note can no longer be saved", () => {
    renderAsWriter(
      <ReturnResolveForm
        rma={makeReturn({ status: "REFUNDED", operatorNotes: "Готово" })}
      />,
    );
    expect(screen.getByText("Готово")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: d.notesEdit }),
    ).not.toBeInTheDocument();
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
