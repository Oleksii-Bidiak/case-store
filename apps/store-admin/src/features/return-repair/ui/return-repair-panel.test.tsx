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
import type { ReturnEntity, ReturnRepairStepEntity } from "@/entities/return";
import { ReturnRepairPanel } from "./return-repair-panel";

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

const WRITER = { permissions: ["returns:read", "returns:write"] };
const READER = { permissions: ["returns:read"] };
const ANCHOR = "return-decision";

const OPERATOR = { id: "u-1", name: "Ірина Коваль", email: "irina@shop.ua" };

function makeStep(
  step: ReturnRepairStepEntity["step"],
  overrides: Partial<ReturnRepairStepEntity> = {},
): ReturnRepairStepEntity {
  return {
    step,
    result: null,
    destination: null,
    ttn: null,
    createdAt: "2026-10-03T09:30:00.000Z",
    note: null,
    actor: OPERATOR,
    ...overrides,
  };
}

function makeReturn(overrides: Partial<ReturnEntity> = {}): ReturnEntity {
  return {
    id: "return-uuid-1234",
    orderId: "order-uuid-1234",
    status: "APPROVED",
    reason: "Не заряджається",
    operatorNotes: null,
    requestedAt: "2026-10-01T10:00:00.000Z",
    resolvedAt: "2026-10-02T10:00:00.000Z",
    restockedAt: null,
    refundedAmount: null,
    requestedOutcome: "REPAIR",
    channel: "ACCOUNT",
    decision: "REPAIR",
    decisionReason: null,
    decidedAt: "2026-10-02T10:00:00.000Z",
    decidedBy: OPERATOR,
    decisionLegacy: false,
    decisionHistory: [],
    repairSteps: [],
    orderCreatedAt: "2026-09-20T10:00:00.000Z",
    items: [
      {
        id: "return-item-1",
        orderItemId: "order-item-1",
        quantity: 1,
        productName: "Навушники AirPods Pro",
        price: "8999.00",
      },
    ],
    ...overrides,
  };
}

const render = (rma: ReturnEntity, auth = WRITER) =>
  renderWithProviders(
    <ReturnRepairPanel rma={rma} decisionAnchorId={ANCHOR} />,
    { auth },
  );

/** Stub the step POST, capturing the body the client actually sent. */
function stubStep(respond: () => Response | Promise<Response>) {
  const bodies: Array<Record<string, unknown>> = [];
  server.use(
    http.post(
      "*/api/admin/returns/:returnId/repair-steps",
      async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return respond();
      },
    ),
  );
  return bodies;
}

const timeline = () => screen.getByRole("list", { name: d.repairStepsAria });
const submitFor = (step: string) =>
  userEvent.click(screen.getByRole("button", { name: d.repairSubmit(step) }));

describe("ReturnRepairPanel — when it shows (TASK-2045)", () => {
  it("renders nothing under any decision other than REPAIR", () => {
    render(makeReturn({ decision: "REFUND" }));
    expect(
      screen.queryByRole("heading", { name: d.repairHeading }),
    ).not.toBeInTheDocument();
  });

  it("lists the five rows, the decision first and done", () => {
    render(makeReturn());

    const rows = within(timeline()).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent(d.repairStepDecision);
    expect(rows[0]).toHaveTextContent(OPERATOR.name);
    expect(rows[1]).toHaveTextContent(d.repairStepACCEPTED);
    expect(rows[1]).toHaveAttribute("aria-current", "step");
    expect(rows[4]).toHaveTextContent(d.repairStepHANDED_TO_CUSTOMER);
  });

  it("shows the purchase date and that the warranty is not checked", () => {
    render(makeReturn());
    expect(
      screen.getByText(new RegExp(d.repairWarrantyNotChecked)),
    ).toHaveTextContent(/20\.09\.2026/);
  });

  it("shows each recorded step with who, when, service, waybill and note", () => {
    render(
      makeReturn({
        repairSteps: [
          makeStep("ACCEPTED"),
          makeStep("SENT_TO_SERVICE", {
            destination: "iCenter, Київ",
            ttn: "20450000000001",
            note: "Відправили з коробкою",
          }),
        ],
      }),
    );

    const sent = within(timeline()).getAllByRole("listitem")[2];
    expect(sent).toHaveTextContent(d.repairStepSENT_TO_SERVICE);
    expect(sent).toHaveTextContent(OPERATOR.name);
    expect(sent).toHaveTextContent("iCenter, Київ");
    expect(sent).toHaveTextContent("20450000000001");
    expect(sent).toHaveTextContent("Відправили з коробкою");
  });

  it("offers no form to a reader", () => {
    render(makeReturn(), READER);
    expect(
      screen.queryByRole("button", {
        name: d.repairSubmit(d.repairStepACCEPTED),
      }),
    ).not.toBeInTheDocument();
  });

  it("says the repair is over once the goods are handed back", () => {
    render(
      makeReturn({
        status: "RECEIVED",
        repairSteps: [
          makeStep("ACCEPTED"),
          makeStep("SENT_TO_SERVICE"),
          makeStep("RETURNED_FROM_SERVICE", { result: "REPAIRED" }),
          makeStep("HANDED_TO_CUSTOMER", { ttn: "20450000000002" }),
        ],
      }),
    );
    expect(screen.getByText(d.repairComplete)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Записати/ })).toBeNull();
  });
});

describe("ReturnRepairPanel — recording the next step", () => {
  it("records «accepted» with nothing but the step", async () => {
    const after = makeReturn({ repairSteps: [makeStep("ACCEPTED")] });
    const bodies = stubStep(() => HttpResponse.json({ data: after }));
    server.use(
      http.get("*/api/admin/returns/:id", () =>
        HttpResponse.json({ data: after }),
      ),
    );
    render(makeReturn());

    await submitFor(d.repairStepACCEPTED);

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ step: "ACCEPTED", note: null });
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        d.repairSuccess(d.repairStepACCEPTED),
      ),
    );
  });

  it("sends the service and waybill when it leaves for the service", async () => {
    const bodies = stubStep(() => HttpResponse.json({ data: makeReturn() }));
    render(makeReturn({ repairSteps: [makeStep("ACCEPTED")] }));

    await userEvent.type(
      screen.getByLabelText(d.repairServiceLabel),
      "iCenter, Київ",
    );
    await userEvent.type(
      screen.getByLabelText(d.repairTtnLabel),
      "20450000000001",
    );
    await userEvent.type(
      screen.getByLabelText(d.repairNoteLabel),
      "Без зарядного",
    );
    expect(
      screen.getByLabelText(d.repairServiceLabel),
    ).toHaveAccessibleDescription(d.repairCustomerSeesHint);
    expect(
      screen.getByLabelText(d.repairNoteLabel),
    ).toHaveAccessibleDescription(d.repairNoteHint);
    await submitFor(d.repairStepSENT_TO_SERVICE);

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      step: "SENT_TO_SERVICE",
      destination: "iCenter, Київ",
      ttn: "20450000000001",
      note: "Без зарядного",
    });
  });

  it("asks for the outcome before recording the return from service", async () => {
    const bodies = stubStep(() => HttpResponse.json({ data: makeReturn() }));
    render(
      makeReturn({
        repairSteps: [makeStep("ACCEPTED"), makeStep("SENT_TO_SERVICE")],
      }),
    );

    await submitFor(d.repairStepRETURNED_FROM_SERVICE);

    expect(await screen.findByText(d.repairResultRequired)).toBeVisible();
    expect(bodies).toHaveLength(0);
    expect(
      screen.getByRole("radio", { name: d.repairResultREPAIRED }),
    ).toHaveFocus();

    await userEvent.click(
      screen.getByRole("radio", { name: d.repairResultUNREPAIRABLE }),
    );
    await submitFor(d.repairStepRETURNED_FROM_SERVICE);

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      step: "RETURNED_FROM_SERVICE",
      result: "UNREPAIRABLE",
      note: null,
    });
  });

  it("takes a waybill or a pickup point on the handover", async () => {
    const bodies = stubStep(() => HttpResponse.json({ data: makeReturn() }));
    render(
      makeReturn({
        repairSteps: [
          makeStep("ACCEPTED"),
          makeStep("SENT_TO_SERVICE"),
          makeStep("RETURNED_FROM_SERVICE", { result: "REPAIRED" }),
        ],
      }),
    );

    await userEvent.type(
      screen.getByLabelText(d.repairHandoverPointLabel),
      "Магазин на Хрещатику, 22",
    );
    await submitFor(d.repairStepHANDED_TO_CUSTOMER);

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      step: "HANDED_TO_CUSTOMER",
      ttn: null,
      destination: "Магазин на Хрещатику, 22",
      note: null,
    });
  });

  it("says the page is stale when another operator recorded the step first", async () => {
    stubStep(() =>
      HttpResponse.json(
        {
          statusCode: 409,
          error: "RETURN_REPAIR_STEP_INVALID",
          message: "The repair step ACCEPTED has already been recorded",
        },
        { status: 409 },
      ),
    );
    render(makeReturn());

    await submitFor(d.repairStepACCEPTED);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(d.repairStepInvalid),
    );
  });
});

describe("ReturnRepairPanel — not repairable (B-12 §1.7)", () => {
  it("points to the decision card to change it with a reason", () => {
    render(
      makeReturn({
        repairSteps: [
          makeStep("ACCEPTED"),
          makeStep("SENT_TO_SERVICE"),
          makeStep("RETURNED_FROM_SERVICE", { result: "UNREPAIRABLE" }),
        ],
      }),
    );

    expect(screen.getByText(d.repairUnrepairableHint)).toBeVisible();
    expect(
      screen.getByRole("link", { name: d.repairToDecision }),
    ).toHaveAttribute("href", `#${ANCHOR}`);
    // The item may still go back to the customer unrepaired.
    expect(
      screen.getByRole("button", {
        name: d.repairSubmit(d.repairStepHANDED_TO_CUSTOMER),
      }),
    ).toBeInTheDocument();
  });

  it("has no hint after a successful repair", () => {
    render(
      makeReturn({
        repairSteps: [
          makeStep("ACCEPTED"),
          makeStep("SENT_TO_SERVICE"),
          makeStep("RETURNED_FROM_SERVICE", { result: "REPAIRED" }),
        ],
      }),
    );
    expect(screen.queryByText(d.repairUnrepairableHint)).toBeNull();
  });
});
