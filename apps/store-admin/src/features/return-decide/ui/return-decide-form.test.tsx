import type { ReactElement } from "react";
import { http, HttpResponse } from "msw";
import { QueryClient } from "@tanstack/react-query";
import {
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderMoneyControllerGetQueryKey,
} from "@/entities/order";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { ReturnEntity } from "@/entities/return";
import { ReturnDecideForm } from "./return-decide-form";

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
const renderAsWriter = (ui: ReactElement) =>
  renderWithProviders(ui, { auth: WRITER });

function makeReturn(overrides: Partial<ReturnEntity> = {}): ReturnEntity {
  return {
    id: "return-uuid-1234",
    orderId: "order-uuid-1234",
    status: "REQUESTED",
    reason: "Не заряджається",
    operatorNotes: null,
    requestedAt: "2026-10-01T10:00:00.000Z",
    resolvedAt: null,
    restockedAt: null,
    refundedAmount: null,
    requestedOutcome: "REPAIR",
    channel: "ACCOUNT",
    decision: null,
    decisionReason: null,
    decidedAt: null,
    decisionLegacy: false,
    decisionHistory: [],
    repairSteps: [],
    items: [
      {
        id: "return-item-1",
        orderItemId: "order-item-1",
        quantity: 1,
        productName: "Зарядний пристрій 20W",
        price: "899.00",
      },
    ],
    ...overrides,
  };
}

/** Stub the decision POST, capturing the body the client actually sent. */
function stubDecide(respond: () => Response | Promise<Response>) {
  const bodies: Array<Record<string, unknown>> = [];
  server.use(
    http.post("*/api/admin/returns/:returnId/decision", async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return respond();
    }),
  );
  return bodies;
}

const radio = (decision: string) =>
  screen.getByRole("radio", { name: decision });
const reasonField = () => screen.getByLabelText(d.decideReason);
const submit = () =>
  userEvent.click(screen.getByRole("button", { name: d.decideSubmit }));

describe("ReturnDecideForm — the first decision (TASK-1961, TASK-2044)", () => {
  it("offers the four decisions and says the customer sees the reason", () => {
    renderAsWriter(<ReturnDecideForm rma={makeReturn()} />);

    expect(
      screen.getByRole("region", { name: d.decideHeading(false) }),
    ).toBeInTheDocument();
    for (const label of [
      d.decisionREFUND,
      d.decisionREPLACEMENT,
      d.decisionREPAIR,
      d.decisionREJECT,
    ]) {
      expect(radio(label)).not.toBeChecked();
    }
    // The hint is visible text, not a tooltip: it is the whole point (AD-RET-07).
    expect(screen.getByText(d.decideReasonHint)).toBeVisible();
    expect(reasonField()).toHaveAccessibleDescription(d.decideReasonHint);
  });

  it("asks for a decision before sending anything", async () => {
    const bodies = stubDecide(() => HttpResponse.json({ data: makeReturn() }));
    renderAsWriter(<ReturnDecideForm rma={makeReturn()} />);

    await submit();

    expect(await screen.findByText(d.decideDecisionRequired)).toBeVisible();
    expect(bodies).toHaveLength(0);
  });

  it("sends a positive decision without a reason", async () => {
    const bodies = stubDecide(() =>
      HttpResponse.json({
        data: makeReturn({ status: "APPROVED", decision: "REPAIR" }),
      }),
    );
    renderAsWriter(<ReturnDecideForm rma={makeReturn()} />);

    await userEvent.click(radio(d.decisionREPAIR));
    await submit();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ decision: "REPAIR", reason: null });
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(d.decideSuccess),
    );
  });

  it("refuses a refusal without a reason, under the field (AD-RET-07)", async () => {
    const bodies = stubDecide(() => HttpResponse.json({ data: makeReturn() }));
    renderAsWriter(<ReturnDecideForm rma={makeReturn()} />);

    await userEvent.click(radio(d.decisionREJECT));
    await submit();

    expect(await screen.findByText(d.decideReasonRequired)).toBeVisible();
    expect(reasonField()).toHaveAttribute("aria-invalid", "true");
    expect(bodies).toHaveLength(0);
  });

  it("sends a refusal with its reason", async () => {
    const bodies = stubDecide(() =>
      HttpResponse.json({
        data: makeReturn({ status: "REJECTED", decision: "REJECT" }),
      }),
    );
    renderAsWriter(<ReturnDecideForm rma={makeReturn()} />);

    await userEvent.click(radio(d.decisionREJECT));
    await userEvent.type(reasonField(), "Сліди удару на корпусі");
    await submit();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      decision: "REJECT",
      reason: "Сліди удару на корпусі",
    });
  });
});

describe("ReturnDecideForm — changing a decision (TASK-2044)", () => {
  const decided = () =>
    makeReturn({
      status: "APPROVED",
      decision: "REPAIR",
      decisionReason: null,
      decidedAt: "2026-10-02T09:00:00.000Z",
    });

  it("folds the form behind «Змінити рішення…» once a decision exists", async () => {
    renderAsWriter(<ReturnDecideForm rma={decided()} />);

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    const open = screen.getByRole("button", { name: d.decideOpen });
    expect(open).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(open);

    expect(radio(d.decisionREPAIR)).toBeChecked();
    expect(reasonField()).toHaveFocus();
  });

  it("requires a reason to change it, then sends the change", async () => {
    const bodies = stubDecide(() =>
      HttpResponse.json({
        data: makeReturn({ status: "APPROVED", decision: "REFUND" }),
      }),
    );
    renderAsWriter(<ReturnDecideForm rma={decided()} />);
    await userEvent.click(screen.getByRole("button", { name: d.decideOpen }));

    await userEvent.click(radio(d.decisionREFUND));
    await submit();
    expect(await screen.findByText(d.decideReasonRequired)).toBeVisible();
    expect(bodies).toHaveLength(0);

    await userEvent.type(reasonField(), "Ремонт неможливий");
    await submit();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      decision: "REFUND",
      reason: "Ремонт неможливий",
    });
  });

  it("offers no refusal once the goods are back", async () => {
    renderAsWriter(
      <ReturnDecideForm rma={{ ...decided(), status: "RECEIVED" }} />,
    );
    await userEvent.click(screen.getByRole("button", { name: d.decideOpen }));

    expect(radio(d.decisionREFUND)).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: d.decisionREJECT }),
    ).not.toBeInTheDocument();
  });

  it("is gone once the money went back — the decision is locked", () => {
    renderAsWriter(
      <ReturnDecideForm
        rma={makeReturn({ status: "REFUNDED", decision: "REFUND" })}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});

describe("ReturnDecideForm — the server's refusals (TASK-2044)", () => {
  it("puts RETURN_DECISION_REASON_REQUIRED under the reason", async () => {
    stubDecide(() =>
      HttpResponse.json(
        {
          error: "RETURN_DECISION_REASON_REQUIRED",
          message: "A reason is required",
          statusCode: 400,
        },
        { status: 400 },
      ),
    );
    renderAsWriter(<ReturnDecideForm rma={makeReturn()} />);

    await userEvent.click(radio(d.decisionREFUND));
    await submit();

    expect(await screen.findByText(d.decideReasonRequired)).toBeVisible();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("says the decision is locked on RETURN_DECISION_LOCKED", async () => {
    stubDecide(() =>
      HttpResponse.json(
        {
          error: "RETURN_DECISION_LOCKED",
          message: "locked",
          statusCode: 409,
        },
        { status: 409 },
      ),
    );
    renderAsWriter(<ReturnDecideForm rma={makeReturn()} />);

    await userEvent.click(radio(d.decisionREFUND));
    await submit();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(d.decideLocked),
    );
  });
});

describe("ReturnDecideForm — the order's money moves with the decision (TASK-2350)", () => {
  it("refetches the order money journal, whose updatedAt the decision bumped", async () => {
    stubDecide(() =>
      HttpResponse.json({
        data: makeReturn({ status: "APPROVED", decision: "REFUND" }),
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    renderWithProviders(<ReturnDecideForm rma={makeReturn()} />, {
      queryClient,
      auth: WRITER,
    });

    await userEvent.click(radio(d.decisionREFUND));
    await submit();

    // A REFUND decision sets the return's credit and recomputes the order, so
    // a payout built from the stale journal would carry an old updatedAt (409).
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: getAdminOrderMoneyControllerGetQueryKey("order-uuid-1234"),
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: getAdminOrderControllerFindByIdQueryKey("order-uuid-1234"),
    });
  });
});

describe("ReturnDecideForm — returns:write gate (TASK-716)", () => {
  it("renders nothing for a session that may only read returns", () => {
    renderWithProviders(<ReturnDecideForm rma={makeReturn()} />, {
      auth: { permissions: ["returns:read"] },
    });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
