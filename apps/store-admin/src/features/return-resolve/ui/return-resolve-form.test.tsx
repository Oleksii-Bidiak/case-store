import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import { returnStatusLabel, type ReturnEntity } from "@/entities/return";
import { ReturnResolveForm } from "./return-resolve-form";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

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
function stubResolve(respond: () => Response) {
  const bodies: Array<Record<string, unknown>> = [];
  server.use(
    http.patch("*/api/admin/returns/:returnId", async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return respond();
    }),
  );
  return bodies;
}

const pickStatus = async (status: string) => {
  await userEvent.click(
    screen.getByRole("combobox", { name: dict.returns.resolveStatusAria }),
  );
  await userEvent.click(
    await screen.findByRole("option", { name: returnStatusLabel(status) }),
  );
};

describe("ReturnResolveForm — the restock question (TASK-340)", () => {
  it("offers the restock checkbox only when moving to RECEIVED", async () => {
    renderWithProviders(<ReturnResolveForm rma={makeReturn()} />);

    // Nothing chosen yet — the question has not arisen.
    expect(
      screen.queryByRole("checkbox", { name: dict.returns.resolveRestock }),
    ).not.toBeInTheDocument();

    await pickStatus("RECEIVED");

    expect(
      await screen.findByRole("checkbox", {
        name: dict.returns.resolveRestock,
      }),
    ).toBeInTheDocument();
  });

  it("hides the checkbox on a refusal — no goods are coming back", async () => {
    renderWithProviders(<ReturnResolveForm rma={makeReturn()} />);

    await pickStatus("REJECTED");

    expect(
      screen.queryByRole("checkbox", { name: dict.returns.resolveRestock }),
    ).not.toBeInTheDocument();
  });

  it("refuses to offer a second restock once the goods were already credited", async () => {
    renderWithProviders(
      <ReturnResolveForm
        rma={makeReturn({
          status: "APPROVED",
          restockedAt: "2026-07-05T09:00:00.000Z",
        })}
      />,
    );

    await pickStatus("RECEIVED");

    expect(
      screen.queryByRole("checkbox", { name: dict.returns.resolveRestock }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(dict.returns.resolveRestockAlreadyDone),
    ).toBeInTheDocument();
  });

  it("omits `restock` from the body unless the operator ticked it", async () => {
    const bodies = stubResolve(() =>
      HttpResponse.json({ data: makeReturn({ status: "RECEIVED" }) }),
    );

    renderWithProviders(<ReturnResolveForm rma={makeReturn()} />);
    await pickStatus("RECEIVED");
    await userEvent.click(
      screen.getByRole("button", { name: dict.returns.resolveSubmit }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty("restock");
    expect(bodies[0].status).toBe("RECEIVED");
  });
});

describe("ReturnResolveForm — terminal states and money (TASK-340)", () => {
  it("offers no control at all on a refunded return", () => {
    renderWithProviders(
      <ReturnResolveForm rma={makeReturn({ status: "REFUNDED" })} />,
    );

    expect(
      screen.getByText(dict.returns.resolveNoTransitions),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: dict.returns.resolveStatusAria }),
    ).not.toBeInTheDocument();
  });

  it("rejects a malformed refund amount before it reaches the server", async () => {
    const bodies = stubResolve(() => HttpResponse.json({ data: makeReturn() }));

    renderWithProviders(
      <ReturnResolveForm rma={makeReturn({ status: "RECEIVED" })} />,
    );
    await pickStatus("REFUNDED");
    await userEvent.type(
      screen.getByLabelText(dict.returns.resolveRefundedAmount),
      "499,00",
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.returns.resolveSubmit }),
    );

    expect(
      await screen.findByText(dict.returns.resolveRefundedAmountInvalid),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("sends a partial refund through as the decimal string it is", async () => {
    const bodies = stubResolve(() =>
      HttpResponse.json({ data: makeReturn({ status: "REFUNDED" }) }),
    );

    renderWithProviders(
      <ReturnResolveForm rma={makeReturn({ status: "RECEIVED" })} />,
    );
    await pickStatus("REFUNDED");
    await userEvent.type(
      screen.getByLabelText(dict.returns.resolveRefundedAmount),
      "499.00",
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.returns.resolveSubmit }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].refundedAmount).toBe("499.00");
  });
});

describe("ReturnResolveForm — the refund ceiling (TASK-785)", () => {
  const typeAmountAndSubmit = async (amount: string) => {
    await pickStatus("REFUNDED");
    await userEvent.type(
      screen.getByLabelText(dict.returns.resolveRefundedAmount),
      amount,
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.returns.resolveSubmit }),
    );
  };

  it("refuses 49900 typed for 499.00 before it reaches the server", async () => {
    const bodies = stubResolve(() => HttpResponse.json({ data: makeReturn() }));

    renderWithProviders(
      <ReturnResolveForm rma={makeReturn({ status: "RECEIVED" })} />,
    );
    await typeAmountAndSubmit("49900");

    // Compared on raw textContent: the currency's non-breaking space does not
    // survive the query's whitespace normalisation.
    const error = await screen.findByText(/вартість позицій/);
    expect(error.textContent).toBe(
      dict.returns.resolveRefundExceedsReturnedValue(formatCurrency("998.00")),
    );
    expect(
      screen.getByLabelText(dict.returns.resolveRefundedAmount),
    ).toHaveAttribute("aria-invalid", "true");
    expect(bodies).toHaveLength(0);
  });

  it("lets the full value of the returned lines through", async () => {
    const bodies = stubResolve(() =>
      HttpResponse.json({ data: makeReturn({ status: "REFUNDED" }) }),
    );

    renderWithProviders(
      <ReturnResolveForm rma={makeReturn({ status: "RECEIVED" })} />,
    );
    await typeAmountAndSubmit("998.00");

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].refundedAmount).toBe("998.00");
  });

  // The order-balance ceiling needs data this card is not given, so the server
  // is its only judge; its refusal belongs under the amount, not in a toast
  // that blames the restock checkbox.
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

    renderWithProviders(
      <ReturnResolveForm rma={makeReturn({ status: "RECEIVED" })} />,
    );
    await typeAmountAndSubmit("499.00");

    expect(
      await screen.findByText(dict.returns.resolveRefundExceedsOrderBalance()),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(dict.returns.resolveRefundedAmount),
    ).toHaveAttribute("aria-invalid", "true");
  });
});

describe("ReturnResolveForm — operator notes (TASK-794)", () => {
  it("stops typing at the DTO's limit", () => {
    renderWithProviders(<ReturnResolveForm rma={makeReturn()} />);

    expect(screen.getByLabelText(dict.returns.operatorNotes)).toHaveAttribute(
      "maxLength",
      "2000",
    );
  });

  it("says why an over-long note blocks the submit", async () => {
    const bodies = stubResolve(() => HttpResponse.json({ data: makeReturn() }));

    renderWithProviders(<ReturnResolveForm rma={makeReturn()} />);
    await pickStatus("REJECTED");
    // `maxLength` governs typing only; a value arriving another way still
    // meets the schema, and that refusal used to be silent.
    fireEvent.change(screen.getByLabelText(dict.returns.operatorNotes), {
      target: { value: "н".repeat(2001) },
    });
    await userEvent.click(
      screen.getByRole("button", { name: dict.returns.resolveSubmit }),
    );

    expect(
      await screen.findByText(dict.returns.operatorNotesTooLong),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(dict.returns.operatorNotes)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(bodies).toHaveLength(0);
  });
});
