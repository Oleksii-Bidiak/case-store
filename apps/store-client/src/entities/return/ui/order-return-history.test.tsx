import { focusManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import {
  act,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeReturn } from "@/shared/test/msw-handlers";
import type { ReturnEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import {
  GuestOrderReturnHistory,
  OrderReturnHistory,
} from "./order-return-history";

const r = dict.returnRequest;

const authed = {
  auth: { isAuthenticated: true, accessToken: "token" },
} as const;

function serveReturns(returns: ReturnEntity[]) {
  let calls = 0;
  server.use(
    http.get("*/api/orders/:orderId/returns", () => {
      calls += 1;
      return HttpResponse.json({ data: returns });
    }),
  );
  return () => calls;
}

async function renderHistory(returns: ReturnEntity[]) {
  serveReturns(returns);
  renderWithProviders(<OrderReturnHistory orderId="order-1" />, authed);
  return screen.findByRole("region", { name: r.historyTitle });
}

/** One return's card, found by its heading. */
async function returnCard(ref: string) {
  const heading = await screen.findByRole("heading", {
    level: 3,
    name: new RegExp(`#${ref}`),
  });
  return within(heading.closest("article") as HTMLElement);
}

describe("OrderReturnHistory (TASK-1962)", () => {
  it("renders nothing for an order without returns", async () => {
    const calls = serveReturns([]);
    const { container } = renderWithProviders(
      <OrderReturnHistory orderId="order-1" />,
      authed,
    );

    await waitFor(() => expect(calls()).toBe(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("lists every request: date filed, lines × quantities, status, what was asked for", async () => {
    await renderHistory([
      makeReturn({
        id: "aaaa1111-x",
        status: "REQUESTED",
        requestedAt: "2026-06-10T10:00:00.000Z",
        requestedOutcome: "REPAIR",
        items: [
          {
            id: "ri-1",
            orderItemId: "item-1",
            quantity: 2,
            productName: "Чохол MagSafe",
            price: "499.00",
          },
          {
            id: "ri-2",
            orderItemId: "item-2",
            quantity: 1,
            productName: "Скло захисне",
            price: "199.00",
          },
        ],
      }),
      makeReturn({ id: "bbbb2222-y", status: "REJECTED" }),
    ]);

    expect(screen.getAllByRole("article")).toHaveLength(2);
    const card = await returnCard("AAAA1111");
    expect(
      card.getByRole("heading", {
        name: r.historyItem("AAAA1111", "10 червня 2026"),
      }),
    ).toBeInTheDocument();
    const lines = card.getByRole("list", { name: r.historyItemsAria });
    expect(
      within(lines)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Чохол MagSafe × 2", "Скло захисне × 1"]);
    expect(card.getByText(r.statusLabels.REQUESTED)).toBeInTheDocument();
    expect(card.getByText(r.requestedOutcome)).toBeInTheDocument();
    expect(card.getByText(r.outcomeLabels.REPAIR)).toBeInTheDocument();
    expect(card.getByText(r.decisionPending)).toBeInTheDocument();
  });

  it("does not say what was asked for when the customer did not say", async () => {
    await renderHistory([makeReturn({ requestedOutcome: null })]);

    expect(screen.queryByText(r.requestedOutcome)).not.toBeInTheDocument();
  });

  it("shows the decision with its reason and date", async () => {
    await renderHistory([
      makeReturn({
        status: "REJECTED",
        decision: "REJECT",
        decisionReason: "Сліди використання",
        decidedAt: "2026-06-12T09:00:00.000Z",
      }),
    ]);

    const card = await returnCard("RETURN-1");
    expect(card.getByText(r.decision)).toBeInTheDocument();
    expect(card.getByText(r.decisionLabels.REJECT)).toBeInTheDocument();
    expect(
      card.getByText(r.decidedOn("12 червня 2026"), { exact: false }),
    ).toBeInTheDocument();
    expect(card.getByText(r.decisionReason)).toBeInTheDocument();
    expect(card.getByText("Сліди використання")).toBeInTheDocument();
    expect(card.queryByText(r.decisionPending)).not.toBeInTheDocument();
  });

  it("says a legacy decision has no reason, without internal jargon", async () => {
    await renderHistory([
      makeReturn({
        status: "APPROVED",
        decision: "REFUND",
        decisionLegacy: true,
        decisionReason: null,
        decidedAt: null,
        resolvedAt: "2026-06-11T09:00:00.000Z",
      }),
    ]);

    const card = await returnCard("RETURN-1");
    expect(card.getByText(r.decisionLabels.REFUND)).toBeInTheDocument();
    expect(card.getByText("Причину не вказано")).toBeInTheDocument();
    // «B-12» is the shop's internal milestone — customers never see it.
    expect(card.queryByText(/B-12/)).not.toBeInTheDocument();
    // The date falls back to when the request was resolved.
    expect(
      card.getByText(r.decidedOn("11 червня 2026"), { exact: false }),
    ).toBeInTheDocument();
    expect(card.queryByText(r.decisionReason)).not.toBeInTheDocument();
  });

  it("lists repair steps in order, with the service's result and dates", async () => {
    await renderHistory([
      makeReturn({
        status: "RECEIVED",
        decision: "REPAIR",
        decidedAt: "2026-06-11T09:00:00.000Z",
        repairSteps: [
          {
            step: "ACCEPTED",
            result: null,
            destination: null,
            ttn: null,
            createdAt: "2026-06-12T09:00:00.000Z",
          },
          {
            step: "RETURNED_FROM_SERVICE",
            result: "REPAIRED",
            destination: "Сервіс-центр",
            ttn: null,
            createdAt: "2026-06-20T09:00:00.000Z",
          },
        ],
      }),
    ]);

    const card = await returnCard("RETURN-1");
    const steps = card.getByRole("list", { name: r.repairTitle });
    const rows = within(steps).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(r.repairStepLabels.ACCEPTED);
    expect(rows[0]).toHaveTextContent("12 червня 2026");
    expect(rows[1]).toHaveTextContent(r.repairStepLabels.RETURNED_FROM_SERVICE);
    expect(rows[1]).toHaveTextContent(r.repairResultLabels.REPAIRED);
    expect(rows[1]).toHaveTextContent("20 червня 2026");
  });

  it("has no repair list when there are no steps", async () => {
    await renderHistory([makeReturn({ repairSteps: [] })]);

    expect(
      screen.queryByRole("list", { name: r.repairTitle }),
    ).not.toBeInTheDocument();
  });

  it("says so and offers a retry when the history fails to load", async () => {
    let fail = true;
    server.use(
      http.get("*/api/orders/:orderId/returns", () =>
        fail
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ data: [makeReturn()] }),
      ),
    );
    renderWithProviders(<OrderReturnHistory orderId="order-1" />, authed);

    expect(await screen.findByRole("alert")).toHaveTextContent(r.loadError);
    fail = false;
    await userEvent.click(
      screen.getByRole("button", { name: dict.common.retry }),
    );

    expect(
      await screen.findByRole("region", { name: r.historyTitle }),
    ).toBeInTheDocument();
  });

  it("does not ask while disabled", async () => {
    const calls = serveReturns([makeReturn()]);
    renderWithProviders(
      <OrderReturnHistory orderId="order-1" enabled={false} />,
      authed,
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls()).toBe(0);
  });
});

// TASK-1965: the same history on a guest order — by the access token, no
// session, and never through the account endpoint.
describe("GuestOrderReturnHistory (TASK-1965)", () => {
  it("reads the guest-token endpoint without a session", async () => {
    const tokens: unknown[] = [];
    let accountCalls = 0;
    server.use(
      http.get("*/api/orders/guest/:token/returns", ({ params }) => {
        tokens.push(params.token);
        return HttpResponse.json({
          data: [makeReturn({ id: "bbbb2222-x", channel: "GUEST_LINK" })],
        });
      }),
      http.get("*/api/orders/:orderId/returns", () => {
        accountCalls += 1;
        return HttpResponse.json({ data: [] });
      }),
    );
    renderWithProviders(<GuestOrderReturnHistory token="guest-token" />);

    expect(
      await screen.findByRole("heading", { level: 3, name: /#BBBB2222/ }),
    ).toBeInTheDocument();
    expect(tokens).toEqual(["guest-token"]);
    expect(accountCalls).toBe(0);
  });

  it("says so and offers a retry when the history fails to load", async () => {
    let fail = true;
    server.use(
      http.get("*/api/orders/guest/:token/returns", () =>
        fail
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ data: [makeReturn()] }),
      ),
    );
    renderWithProviders(<GuestOrderReturnHistory token="guest-token" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(r.loadError);
    fail = false;
    await userEvent.click(
      screen.getByRole("button", { name: dict.common.retry }),
    );

    expect(
      await screen.findByRole("region", { name: r.historyTitle }),
    ).toBeInTheDocument();
  });

  // The guest endpoint is throttled (20/min per IP): a refetch on every tab
  // switch would let an ordinary guest lock themselves out.
  it("does not ask again when the window regains focus", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/orders/guest/:token/returns", () => {
        calls += 1;
        return HttpResponse.json({ data: [makeReturn()] });
      }),
    );
    renderWithProviders(<GuestOrderReturnHistory token="guest-token" />);
    await screen.findByRole("region", { name: r.historyTitle });
    expect(calls).toBe(1);

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toBe(1);
  });
});
