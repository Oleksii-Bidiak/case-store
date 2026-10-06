import { http, HttpResponse } from "msw";

import {
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import {
  CASES_ID,
  categoryReport,
} from "@/shared/test/analytics-report-fixtures";
import { dict } from "@/shared/config";
import { CatalogueReport } from "./CatalogueReport";

/** TASK-692 — «Категорії й бренди»: tabs in the URL, roots opening on demand. */

const d = dict.analytics;
const QUERY = { preset: "30d" as const };
const OWNER = { auth: { isOwner: true } };

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/analytics",
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
});

describe("CatalogueReport — categories", () => {
  it("says what the counting is based on, with revenue for the owner", async () => {
    renderWithProviders(<CatalogueReport query={QUERY} />, OWNER);

    expect(await screen.findByText("Смартфони")).toBeInTheDocument();
    expect(screen.getByText(d.catalogueBasis)).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: d.colRevenue }),
    ).toBeInTheDocument();
    expect(screen.getByText(d.grossNote)).toBeInTheDocument();
  });

  it("opens a root into its children, asking for them by parentId", async () => {
    const asked: Array<string | null> = [];
    server.use(
      http.get("*/api/admin/analytics/reports/categories", ({ request }) => {
        const parentId = new URL(request.url).searchParams.get("parentId");
        asked.push(parentId);
        return HttpResponse.json({ data: categoryReport(parentId) });
      }),
    );
    renderWithProviders(<CatalogueReport query={QUERY} />, OWNER);

    const toggle = await screen.findByRole("button", { name: "Чохли" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // A root without children has nothing to open.
    expect(
      screen.queryByRole("button", { name: "Смартфони" }),
    ).not.toBeInTheDocument();

    await userEvent.click(toggle);

    expect(await screen.findByText("Чохли для iPhone")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(asked).toEqual([null, CASES_ID]);
    // aria-controls names the rows it opened.
    const controlled = (toggle.getAttribute("aria-controls") ?? "").split(" ");
    expect(controlled).toHaveLength(3);
    for (const id of controlled) {
      expect(document.getElementById(id)).toBeInTheDocument();
    }
    // Sales placed on «Чохли» itself, not in a child.
    expect(screen.getByText(d.directRow("Чохли"))).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.queryByText("Чохли для iPhone")).not.toBeInTheDocument();
  });

  it("drops the revenue column when the API sends no money", async () => {
    server.use(
      http.get("*/api/admin/analytics/reports/categories", () =>
        HttpResponse.json({ data: categoryReport(null, { revenue: false }) }),
      ),
    );
    renderWithProviders(<CatalogueReport query={QUERY} />, {
      auth: { permissions: ["analytics:read"] },
    });

    expect(await screen.findByText("Смартфони")).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: d.colRevenue }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(d.grossNote)).not.toBeInTheDocument();
  });

  it("says so when nothing sold", async () => {
    server.use(
      http.get("*/api/admin/analytics/reports/categories", () =>
        HttpResponse.json({
          data: { ...categoryReport(), rows: [] },
        }),
      ),
    );
    renderWithProviders(<CatalogueReport query={QUERY} />, OWNER);
    expect(await screen.findByText(d.nothingSold)).toBeInTheDocument();
  });
});

describe("CatalogueReport — brands", () => {
  it("writes view=brands to the URL from the tab, and clears it back", async () => {
    renderWithProviders(<CatalogueReport query={QUERY} />, OWNER);
    await screen.findByText("Смартфони");

    await userEvent.click(screen.getByRole("tab", { name: d.tabBrands }));
    expect(mockReplace).toHaveBeenCalledWith("/analytics?view=brands");
  });

  it("names a product without a brand «Без бренду»", async () => {
    mockSearchParams = new URLSearchParams("view=brands");
    renderWithProviders(<CatalogueReport query={QUERY} />, OWNER);

    const panel = await screen.findByRole("tabpanel");
    expect(await within(panel).findByText("Spigen")).toBeInTheDocument();
    expect(within(panel).getByText(d.noBrand)).toBeInTheDocument();
    expect(
      within(panel).getByRole("columnheader", { name: d.colBrand }),
    ).toBeInTheDocument();
  });
});
