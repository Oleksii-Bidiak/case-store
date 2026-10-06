import { http, HttpResponse } from "msw";

import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import {
  OUTSIDERS_TOTAL,
  productsReport,
} from "@/shared/test/analytics-report-fixtures";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib/format";
import { ProductsReport } from "./ProductsReport";

/** TASK-692 — «Лідери й аутсайдери». */

const d = dict.analytics;
const QUERY = { preset: "30d" as const };
const exact = { normalizer: (text: string) => text.trim() };

function serveProducts(options: { revenue?: boolean } = {}) {
  const limits: number[] = [];
  server.use(
    http.get("*/api/admin/analytics/reports/products", ({ request }) => {
      const limit = Number(new URL(request.url).searchParams.get("limit"));
      limits.push(limit);
      return HttpResponse.json({ data: productsReport(limit, options) });
    }),
  );
  return limits;
}

describe("ProductsReport", () => {
  it("ranks by revenue for the owner, linking each product", async () => {
    serveProducts();
    renderWithProviders(<ProductsReport query={QUERY} />);

    expect(await screen.findByText(d.leadersByRevenue)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Apple iPhone 16 Pro" }),
    ).toHaveAttribute("href", "/products/p-iphone");
    expect(
      screen.getByText(`${d.pieces("1")} · ${formatCurrency(54999)}`, exact),
    ).toBeInTheDocument();
  });

  it("says the ranking is by units when the API sent no money", async () => {
    serveProducts({ revenue: false });
    renderWithProviders(<ProductsReport query={QUERY} />);

    expect(await screen.findByText(d.leadersByUnits)).toBeInTheDocument();
    expect(screen.queryByText(d.leadersByRevenue)).not.toBeInTheDocument();
    expect(screen.getByText(d.pieces("22"))).toBeInTheDocument();
  });

  it("asks for five, then for every outsider up to 50 on «Показати всі»", async () => {
    const limits = serveProducts();
    renderWithProviders(<ProductsReport query={QUERY} />);

    expect(
      await screen.findByText(d.outsidersTitle(OUTSIDERS_TOTAL)),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Товар без продажів/)).toHaveLength(5);

    await userEvent.click(
      screen.getByRole("button", { name: d.outsidersShowAll(OUTSIDERS_TOTAL) }),
    );

    await waitFor(() =>
      expect(screen.getAllByText(/Товар без продажів/)).toHaveLength(
        OUTSIDERS_TOTAL,
      ),
    );
    expect(limits).toEqual([5, OUTSIDERS_TOTAL]);
    // The leaders stay a top five.
    expect(screen.getAllByRole("listitem").length).toBe(5 + OUTSIDERS_TOTAL);
    expect(
      screen.queryByRole("button", {
        name: d.outsidersShowAll(OUTSIDERS_TOTAL),
      }),
    ).not.toBeInTheDocument();
  });

  it("caps the list at 50 and says so", async () => {
    const limits: number[] = [];
    server.use(
      http.get("*/api/admin/analytics/reports/products", ({ request }) => {
        const limit = Number(new URL(request.url).searchParams.get("limit"));
        limits.push(limit);
        const report = productsReport(limit);
        return HttpResponse.json({
          data: {
            ...report,
            outsiders: {
              total: 80,
              rows: Array.from({ length: limit }, (_, index) => ({
                ...report.outsiders.rows[0],
                productId: `p-${index}`,
              })),
            },
          },
        });
      }),
    );
    renderWithProviders(<ProductsReport query={QUERY} />);

    await userEvent.click(
      await screen.findByRole("button", { name: d.outsidersShowAll(80) }),
    );

    expect(
      await screen.findByText(d.outsidersCapped(50, 80)),
    ).toBeInTheDocument();
    expect(limits).toEqual([5, 50]);
  });

  it("dates an outsider by the month it was added, «з березня»", async () => {
    serveProducts();
    renderWithProviders(<ProductsReport query={QUERY} />);
    expect(
      (await screen.findAllByText(`${d.pieces("12")} · з березня`)).length,
    ).toBeGreaterThan(0);
  });

  it("says when nothing sold and when everything did", async () => {
    server.use(
      http.get("*/api/admin/analytics/reports/products", () =>
        HttpResponse.json({
          data: {
            ...productsReport(5),
            leaders: [],
            outsiders: { total: 0, rows: [] },
          },
        }),
      ),
    );
    renderWithProviders(<ProductsReport query={QUERY} />);

    expect(await screen.findByText(d.nothingSold)).toBeInTheDocument();
    expect(screen.getByText(d.outsidersNone)).toBeInTheDocument();
  });
});
