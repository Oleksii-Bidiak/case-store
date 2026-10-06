import { http, HttpResponse } from "msw";

import { renderWithProviders, screen, within } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { emptySalesReport } from "@/shared/test/analytics-report-fixtures";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib/format";
import { SalesReport } from "./SalesReport";

/** TASK-692 — «Продажі»: five tiles, the net per day, the empty period. */

const d = dict.analytics;
const QUERY = { preset: "30d" as const };
const MINUS = "−";
const exact = { normalizer: (text: string) => text.trim() };

const tile = (label: string) =>
  screen
    .getAllByText(label)
    .map((node) => node.closest('[data-slot="kpi-tile"]'))
    .find(Boolean) as HTMLElement;

describe("SalesReport", () => {
  it("shows the five figures with their base, refunds as money going out", async () => {
    renderWithProviders(<SalesReport query={QUERY} />);

    expect(
      await screen.findByText(formatCurrency(412300), exact),
    ).toBeInTheDocument();
    const refunds = tile(d.refundsTile);
    expect(
      within(refunds).getByText(`${MINUS}${formatCurrency(18400)}`, exact),
    ).toBeInTheDocument();
    // More refunds than before is bad news: red, though the arrow goes up.
    expect(refunds.querySelector('[data-slot="delta-badge"]')).toHaveClass(
      "text-destructive",
    );
    expect(tile(d.netTile)).toHaveAttribute("data-accent", "true");
    expect(within(tile(d.ordersTile)).getByText("176")).toBeInTheDocument();
    expect(
      within(tile(d.ordersTile)).getByText(d.was("161")),
    ).toBeInTheDocument();
  });

  it("describes the daily net — a day below zero included — for a screen reader", async () => {
    renderWithProviders(<SalesReport query={QUERY} />);

    expect(
      await screen.findByText(
        d.salesChartSummary(
          d.rangeDays(30),
          `${MINUS}${formatCurrency(1299)}`,
          formatCurrency(18700),
        ),
        exact,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(d.salesLegendNegative)).toBeInTheDocument();
    expect(screen.getByText(d.salesFootnote)).toBeInTheDocument();
  });

  it("replaces the chart with a plain statement in an empty period", async () => {
    server.use(
      http.get("*/api/admin/analytics/reports/sales", () =>
        HttpResponse.json({ data: emptySalesReport() }),
      ),
    );
    renderWithProviders(<SalesReport query={QUERY} />);

    expect(await screen.findByText(d.salesEmptyTitle)).toBeInTheDocument();
    expect(screen.getByText(d.salesEmptyText)).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="daily-bar-chart"]'),
    ).not.toBeInTheDocument();
    // The tiles still say zero — real zeros, with what was before.
    expect(within(tile(d.ordersTile)).getByText("0")).toBeInTheDocument();
  });

  it("asks nothing when disabled", () => {
    const requested = jest.fn();
    server.events.on("request:start", requested);
    renderWithProviders(<SalesReport query={QUERY} enabled={false} />);
    expect(requested).not.toHaveBeenCalled();
    server.events.removeAllListeners();
  });

  it("offers a retry when the report fails", async () => {
    server.use(
      http.get(
        "*/api/admin/analytics/reports/sales",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderWithProviders(<SalesReport query={QUERY} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(d.reportError);
    expect(
      screen.getByRole("button", { name: dict.canon.retry }),
    ).toBeInTheDocument();
  });
});
