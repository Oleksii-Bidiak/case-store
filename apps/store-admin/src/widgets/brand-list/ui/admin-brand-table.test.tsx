/**
 * `AdminBrandTable` — TASK-357.
 *
 * This table was already paginated, searchable and filterable; what it lacked was
 * any way to force a refetch (admin queries sit behind a five-minute `staleTime`).
 * The search and the status filter moved INTO the shared toolbar — these cases
 * exist so that move stays a relocation and not a quiet regression.
 */

import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminBrandTable } from "./admin-brand-table";

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/brands",
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
});

function makeBrandRow(id: string, name: string, isActive = true) {
  return {
    id,
    name,
    slug: name.toLowerCase(),
    logoUrl: null,
    isActive,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function stubBrands(
  rows: ReturnType<typeof makeBrandRow>[],
  meta?: { total: number; page: number; limit: number; totalPages: number },
) {
  const requests: URL[] = [];
  server.use(
    http.get("*/api/brands/admin/list", ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({
        data: rows,
        meta: meta ?? { total: rows.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
  return requests;
}

describe("AdminBrandTable — toolbar (TASK-357)", () => {
  it("refetches on demand — the point of the refresh control", async () => {
    const requests = stubBrands([makeBrandRow("b1", "Baseus")]);

    renderWithProviders(<AdminBrandTable />);
    await screen.findByText("Baseus");
    expect(requests).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(requests).toHaveLength(2));
  });

  it("keeps the search box and the status filter reachable inside the toolbar", async () => {
    stubBrands([makeBrandRow("b1", "Baseus")]);

    renderWithProviders(<AdminBrandTable />);
    await screen.findByText("Baseus");

    expect(screen.getByLabelText(dict.brands.searchAria)).toBeInTheDocument();
    expect(
      screen.getByLabelText(dict.brands.filterStatusAria),
    ).toBeInTheDocument();
  });

  it("still forwards the URL search and status filter to the server", async () => {
    mockSearchParams = new URLSearchParams("search=baseus&status=inactive");
    const requests = stubBrands([makeBrandRow("b1", "Baseus", false)]);

    renderWithProviders(<AdminBrandTable />);
    await screen.findByText("Baseus");

    expect(requests[0].searchParams.get("search")).toBe("baseus");
    expect(requests[0].searchParams.get("isActive")).toBe("false");
  });
});
