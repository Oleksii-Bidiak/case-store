import { http, HttpResponse } from "msw";

import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import {
  funnelOff,
  productsReport,
  salesReport,
} from "@/shared/test/analytics-report-fixtures";
import { dict } from "@/shared/config";
import { AnalyticsView } from "./AnalyticsView";

/**
 * TASK-691 — «CSV» on every report card saves what the card shows, under the
 * report's name and the server's days.
 */

const d = dict.analytics;
const FILE_DAYS = "2026-09-06_2026-10-05";

const mockDownloadCsv = jest.fn();
jest.mock("@/shared/lib/download-csv", () => ({
  downloadCsv: (...args: unknown[]) => mockDownloadCsv(...args),
}));

const mockToastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: jest.fn(),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/analytics",
  useSearchParams: () => mockSearchParams,
}));

const OWNER = { auth: { isOwner: true } };

const csvButton = (title: string) =>
  screen.getByRole("button", { name: d.csvAria(title) });

/** Click a report's CSV once it is ready; the file it saved. */
async function download(title: string): Promise<[string, string]> {
  await waitFor(() => expect(csvButton(title)).toBeEnabled());
  mockDownloadCsv.mockClear();
  await userEvent.click(csvButton(title));
  expect(mockDownloadCsv).toHaveBeenCalledTimes(1);
  return mockDownloadCsv.mock.calls[0] as [string, string];
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams("");
  mockDownloadCsv.mockClear();
  mockToastError.mockClear();
});

describe("CSV on the report cards", () => {
  it("names each button by its report and keeps the visible word «CSV»", async () => {
    renderWithProviders(<AnalyticsView />, OWNER);
    const sales = await screen.findByRole("region", { name: d.salesTitle });
    const button = within(sales).getByRole("button", {
      name: d.csvAria(d.salesTitle),
    });
    expect(button).toHaveTextContent(d.csvButton);
  });

  it.each([
    [d.salesTitle, "sales"],
    [d.catalogueTitle, "categories"],
    [d.productsTitle, "products"],
    [d.funnelTitle, "funnel"],
    [d.registrationsTitle, "registrations"],
  ])("saves «%s» as %s-<days>.csv", async (title, report) => {
    renderWithProviders(<AnalyticsView />, OWNER);
    const [csv, filename] = await download(title);
    expect(filename).toBe(`${report}-${FILE_DAYS}.csv`);
    expect(csv.length).toBeGreaterThan(0);
  });

  it("saves the brands tab as brands-<days>.csv", async () => {
    mockSearchParams = new URLSearchParams("view=brands");
    renderWithProviders(<AnalyticsView />, OWNER);
    const [csv, filename] = await download(d.catalogueTitle);
    expect(filename).toBe(`brands-${FILE_DAYS}.csv`);
    expect(csv).toContain(d.noBrand);
  });

  it("includes the categories the owner opened", async () => {
    renderWithProviders(<AnalyticsView />, OWNER);
    await userEvent.click(await screen.findByRole("button", { name: "Чохли" }));
    await screen.findByText("Чохли для iPhone");

    const [csv] = await download(d.catalogueTitle);
    expect(csv).toContain("Чохли для iPhone,Чохли,132,84,109200");
  });

  it("is disabled until the report has loaded", () => {
    renderWithProviders(<AnalyticsView />, OWNER);
    expect(csvButton(d.registrationsTitle)).toBeDisabled();
  });

  it("is not offered while Umami is not answering", async () => {
    server.use(
      http.get("*/api/admin/analytics/reports/funnel", () =>
        HttpResponse.json({ data: funnelOff(false, true) }),
      ),
    );
    renderWithProviders(<AnalyticsView />, OWNER);
    const funnel = screen.getByRole("region", { name: d.funnelTitle });
    await within(funnel).findByText(/Umami не відповів/);
    expect(
      within(funnel).queryByRole("button", { name: d.csvAria(d.funnelTitle) }),
    ).not.toBeInTheDocument();
  });

  it("says so in a toast when the file cannot be built, and saves nothing", async () => {
    // A figure that is not a plain decimal must never reach the file.
    server.use(
      http.get("*/api/admin/analytics/reports/sales", () =>
        HttpResponse.json({
          data: {
            ...salesReport(),
            sales: { current: "not a number", previous: 1, changePct: null },
          },
        }),
      ),
    );
    renderWithProviders(<AnalyticsView />, OWNER);
    await waitFor(() => expect(csvButton(d.salesTitle)).toBeEnabled());

    await userEvent.click(csvButton(d.salesTitle));

    expect(mockDownloadCsv).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(d.csvError);
  });

  it("writes no money for a manager without analytics:revenue", async () => {
    server.use(
      http.get("*/api/admin/analytics/reports/products", () =>
        HttpResponse.json({
          data: productsReport(5, { revenue: false }),
        }),
      ),
    );
    renderWithProviders(<AnalyticsView />, {
      auth: { permissions: ["analytics:read"] },
    });
    expect(
      screen.queryByRole("button", { name: d.csvAria(d.salesTitle) }),
    ).not.toBeInTheDocument();
    const [csv] = await download(d.productsTitle);
    expect(csv).not.toContain(d.colRevenue);
  });
});
