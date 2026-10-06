import { http, HttpResponse } from "msw";

import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import {
  brandReport,
  categoryReport,
  productsReport,
} from "@/shared/test/analytics-report-fixtures";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib/format";
import { AnalyticsView } from "./AnalyticsView";

/**
 * TASK-692 — the view reads the period off the URL and the label off the API,
 * and draws the five reports; «Продажі» exists only for `analytics:revenue`.
 */

const d = dict.analytics;

let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/analytics",
  useSearchParams: () => mockSearchParams,
}));

const OWNER = { auth: { isOwner: true } };
const MANAGER = { auth: { permissions: ["analytics:read"] } };

/** Every request path the page makes, for "it never asked" assertions. */
function recordRequests(): string[] {
  const paths: string[] = [];
  server.events.on("request:start", ({ request }) => {
    paths.push(new URL(request.url).pathname);
  });
  return paths;
}

/** The API's answers for someone without `analytics:revenue`. */
function serveWithoutRevenue() {
  server.use(
    http.get("*/api/admin/analytics/reports/categories", ({ request }) =>
      HttpResponse.json({
        data: categoryReport(
          new URL(request.url).searchParams.get("parentId"),
          { revenue: false },
        ),
      }),
    ),
    http.get("*/api/admin/analytics/reports/brands", () =>
      HttpResponse.json({ data: brandReport({ revenue: false }) }),
    ),
    http.get("*/api/admin/analytics/reports/products", () =>
      HttpResponse.json({ data: productsReport(5, { revenue: false }) }),
    ),
  );
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams("");
});
afterEach(() => server.events.removeAllListeners());

describe("AnalyticsView — the period", () => {
  it("labels the bar with the server's period (default fixture)", async () => {
    renderWithProviders(<AnalyticsView />, MANAGER);
    expect(
      await screen.findByText("6 вересня — 5 жовтня 2026 · 30 днів"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(d.comparedWith("7 серпня — 5 вересня")),
    ).toBeInTheDocument();
  });

  it("asks the API for the period in the URL", async () => {
    mockSearchParams = new URLSearchParams(
      "preset=custom&from=2026-08-01&to=2026-08-31",
    );
    const seen: string[] = [];
    server.use(
      http.get("*/api/admin/analytics/reports/registrations", ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({
          data: {
            period: {
              preset: "custom",
              from: "2026-08-01",
              to: "2026-08-31",
              days: 31,
              previousFrom: "2026-07-01",
              previousTo: "2026-07-31",
              previousDays: 31,
            },
            registrations: { current: 0, previous: 0, changePct: null },
            fromGuest: { current: 0, previous: 0, changePct: null },
            daily: [],
          },
        });
      }),
    );

    renderWithProviders(<AnalyticsView />, MANAGER);

    expect(
      await screen.findByText("1–31 серпня 2026 · 31 день"),
    ).toBeInTheDocument();
    // The bar and the «Реєстрації» block share one query — one request.
    expect(seen).toEqual(["?preset=custom&from=2026-08-01&to=2026-08-31"]);
    expect(
      screen.getByRole("button", { name: d.presetCustom }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("AnalyticsView — the reports", () => {
  it("draws all five reports for the owner, «Продажі» first, with its tiles", async () => {
    renderWithProviders(<AnalyticsView />, OWNER);

    const sales = await screen.findByRole("region", { name: d.salesTitle });
    expect(
      // `formatCurrency` holds non-breaking spaces the default normalizer
      // would flatten on the DOM side only — trim, nothing else.
      await within(sales).findByText(formatCurrency(412300), {
        normalizer: (text) => text.trim(),
      }),
    ).toBeInTheDocument();
    expect(sales.querySelectorAll('[data-slot="kpi-tile"]')).toHaveLength(5);

    const regions = screen
      .getAllByRole("region")
      .map((region) => region.getAttribute("aria-labelledby"))
      .map((id) => document.getElementById(id ?? "")?.textContent);
    expect(regions).toEqual([
      d.salesTitle,
      d.catalogueTitle,
      d.productsTitle,
      d.funnelTitle,
      d.registrationsTitle,
    ]);
    expect(screen.queryByText(d.revenueLocked)).not.toBeInTheDocument();
  });

  it("leaves «Продажі» out entirely without analytics:revenue — and never asks for it", async () => {
    const paths = recordRequests();
    serveWithoutRevenue();

    renderWithProviders(<AnalyticsView />, MANAGER);

    expect(await screen.findByText(d.revenueLocked)).toBeInTheDocument();
    const catalogue = screen.getByRole("region", { name: d.catalogueTitle });
    expect(await within(catalogue).findByText("Чохли")).toBeInTheDocument();

    expect(
      screen.queryByRole("region", { name: d.salesTitle }),
    ).not.toBeInTheDocument();
    expect(
      within(catalogue).queryByRole("columnheader", { name: d.colRevenue }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText(d.leadersByUnits)).toBeInTheDocument();

    await waitFor(() =>
      expect(paths).toContain("/api/admin/analytics/reports/funnel"),
    );
    expect(paths).not.toContain("/api/admin/analytics/reports/sales");
  });

  it("keeps the other reports when one fails", async () => {
    server.use(
      http.get(
        "*/api/admin/analytics/reports/funnel",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    renderWithProviders(<AnalyticsView />, OWNER);

    const funnel = screen.getByRole("region", { name: d.funnelTitle });
    expect(await within(funnel).findByRole("alert")).toHaveTextContent(
      d.reportError,
    );
    const registrations = screen.getByRole("region", {
      name: d.registrationsTitle,
    });
    expect(await within(registrations).findByText("48")).toBeInTheDocument();
  });
});
