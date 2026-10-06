import { http, HttpResponse } from "msw";

import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { funnelOff } from "@/shared/test/analytics-report-fixtures";
import { dict } from "@/shared/config";
import { FunnelReport } from "./FunnelReport";

/** TASK-692 — the funnel's three states never look alike, and none says 0%. */

const d = dict.analytics;
const QUERY = { preset: "30d" as const };

describe("FunnelReport", () => {
  it("shows the conversion, its change in points and the weakest step", async () => {
    renderWithProviders(<FunnelReport query={QUERY} />);

    expect(await screen.findByText("14,2%")).toBeInTheDocument();
    expect(screen.getByText("+1,4 п. п.")).toBeInTheDocument();
    expect(screen.getByText(d.funnelWas("12,8%"))).toBeInTheDocument();
    expect(screen.getByText("1 240")).toBeInTheDocument();
    expect(screen.getByText(d.toCheckout("49%", "47%"))).toBeInTheDocument();
    // Only the lower of the two steps is marked as the biggest loss.
    expect(
      screen.getByText(`${d.toPurchase("29%", "27%")}${d.biggestLoss}`),
    ).toBeInTheDocument();
    expect(screen.getByText(d.funnelEventsNote)).toBeInTheDocument();
  });

  it("says analytics is not connected — not 0%", async () => {
    server.use(
      http.get("*/api/admin/analytics/reports/funnel", () =>
        HttpResponse.json({ data: funnelOff(false, false) }),
      ),
    );
    renderWithProviders(<FunnelReport query={QUERY} />);

    expect(await screen.findByText(d.funnelOffTitle)).toBeInTheDocument();
    // (The explanation quotes «0%» on purpose; no figure says it.)
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: d.funnelRetry }),
    ).not.toBeInTheDocument();
  });

  it("says Umami did not answer, when, and retries on request", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/admin/analytics/reports/funnel", () => {
        calls += 1;
        return HttpResponse.json({ data: funnelOff(false, true) });
      }),
    );
    renderWithProviders(<FunnelReport query={QUERY} />);

    expect(
      await screen.findByText(/^Umami не відповів о \d{2}:\d{2}$/),
    ).toBeInTheDocument();
    expect(screen.getByText(d.funnelDownText)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: d.funnelRetry }));
    await waitFor(() => expect(calls).toBe(2));
  });

  it("shows «—» rather than 0% when nobody added anything to the cart", async () => {
    server.use(
      http.get("*/api/admin/analytics/reports/funnel", () =>
        HttpResponse.json({
          data: {
            ...funnelOff(true, true),
            steps: [
              {
                event: "add_to_cart",
                count: { current: 0, previous: 0, changePct: null },
              },
              {
                event: "begin_checkout",
                count: { current: 0, previous: 0, changePct: null },
              },
              {
                event: "purchase",
                count: { current: 0, previous: 0, changePct: null },
              },
            ],
            transitions: [
              {
                from: "add_to_cart",
                to: "begin_checkout",
                rate: null,
                previousRate: null,
              },
              {
                from: "begin_checkout",
                to: "purchase",
                rate: null,
                previousRate: null,
              },
            ],
          },
        }),
      ),
    );
    renderWithProviders(<FunnelReport query={QUERY} />);

    expect(await screen.findByText(d.funnelWas("—"))).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(
      screen.queryByText(new RegExp(d.biggestLoss)),
    ).not.toBeInTheDocument();
  });
});
