/**
 * `AddonServiceTable` — first tests, TASK-357.
 *
 * This is the 21st list table and the only one plan 168 §5 forgot to assign to a
 * group. It already had URL search, a status filter and pagination, so what was
 * missing was the refresh control — and, more to the point, any test at all: the
 * table shipped in TASK-174 and nothing has ever asserted what it asks the server
 * for. These cases fix that, and they assert on the REQUEST rather than on the
 * rendered response, because every bug this table can have (a wrong page size, a
 * dropped filter, a search that never leaves the browser) shows up there first.
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
import { AddonServiceTable } from "./addon-service-table";

// jsdom mounts no app router, and this table both reads search/status/page from
// the URL and writes them back — so both ends need a stub.
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/addon-services",
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
});

function makeServiceRow(id: string, name: string, isActive = true) {
  return {
    id,
    name,
    description: null,
    price: "199.00",
    isActive,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

/**
 * Stub the list and hand back the recorded request URLs, so a test can assert
 * WHAT the table asked for.
 */
function stubServices(
  rows: ReturnType<typeof makeServiceRow>[],
  meta?: { total: number; page: number; limit: number; totalPages: number },
) {
  const requests: URL[] = [];
  server.use(
    http.get("*/api/addon-services/admin/list", ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({
        data: rows,
        meta: meta ?? { total: rows.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
  return requests;
}

describe("AddonServiceTable", () => {
  it("renders service rows with name, price and status badge", async () => {
    stubServices([
      makeServiceRow("s1", "Гарантія 2 роки"),
      makeServiceRow("s2", "Наклеювання плівки", false),
    ]);

    renderWithProviders(<AddonServiceTable />);

    await waitFor(() =>
      expect(screen.getByText("Гарантія 2 роки")).toBeInTheDocument(),
    );
    expect(screen.getByText("Наклеювання плівки")).toBeInTheDocument();
    expect(
      screen.getByText(dict.addonServices.statusActive),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.addonServices.statusInactive),
    ).toBeInTheDocument();
  });

  it("shows the empty state when there are no services", async () => {
    stubServices([]);

    renderWithProviders(<AddonServiceTable />);

    expect(
      await screen.findByText(dict.addonServices.empty),
    ).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    server.use(
      http.get("*/api/addon-services/admin/list", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    renderWithProviders(<AddonServiceTable />);

    // Queried by TEXT, not by `role="alert"`: `LiveAnnouncer` keeps a permanently
    // mounted, empty assertive region with that same role, so a role query would
    // match the live region instead of the error.
    expect(
      await screen.findByText(dict.addonServices.loadError),
    ).toBeInTheDocument();
  });

  describe("toolbar (TASK-357)", () => {
    it("refetches on demand — the point of the refresh control", async () => {
      const requests = stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);

      renderWithProviders(<AddonServiceTable />);
      await screen.findByText("Гарантія 2 роки");
      expect(requests).toHaveLength(1);

      await userEvent.click(
        screen.getByRole("button", { name: dict.common.table.refreshAria }),
      );

      await waitFor(() => expect(requests).toHaveLength(2));
    });

    it("keeps the search box and the status filter reachable inside the toolbar", async () => {
      stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);

      renderWithProviders(<AddonServiceTable />);
      await screen.findByText("Гарантія 2 роки");

      expect(
        screen.getByLabelText(dict.addonServices.searchAria),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(dict.addonServices.filterStatusAria),
      ).toBeInTheDocument();
    });
  });

  describe("what the table asks the server for", () => {
    it("requests a real page size rather than an unbounded slab", async () => {
      const requests = stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);

      renderWithProviders(<AddonServiceTable />);
      await screen.findByText("Гарантія 2 роки");

      expect(requests[0].searchParams.get("page")).toBe("1");
      expect(requests[0].searchParams.get("limit")).toBe("20");
    });

    it("forwards the URL search and status filter to the server", async () => {
      mockSearchParams = new URLSearchParams("search=гарант&status=inactive");
      const requests = stubServices([
        makeServiceRow("s1", "Гарантія 2 роки", false),
      ]);

      renderWithProviders(<AddonServiceTable />);
      await screen.findByText("Гарантія 2 роки");

      expect(requests[0].searchParams.get("search")).toBe("гарант");
      expect(requests[0].searchParams.get("isActive")).toBe("false");
    });

    it("omits isActive entirely when no status filter is set", async () => {
      const requests = stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);

      renderWithProviders(<AddonServiceTable />);
      await screen.findByText("Гарантія 2 роки");

      expect(requests[0].searchParams.has("isActive")).toBe(false);
    });

    // The pager is the whole reason this table can be trusted past row 20: a
    // control that is present but never reaches page 2 is the same silent
    // truncation TASK-357 removed from the blog and pages tables.
    it("shows a reachable control past the page boundary and pages forward", async () => {
      mockSearchParams = new URLSearchParams("");
      stubServices([makeServiceRow("s1", "Гарантія 2 роки")], {
        total: 140,
        page: 1,
        limit: 20,
        totalPages: 7,
      });

      renderWithProviders(<AddonServiceTable />);
      await screen.findByText("Гарантія 2 роки");

      expect(screen.getByText(dict.common.pageOf(1, 7))).toBeInTheDocument();
      const next = screen.getByRole("button", { name: dict.common.next });
      expect(next).toBeEnabled();

      await userEvent.click(next);

      expect(mockReplace).toHaveBeenCalledWith("/addon-services?page=2");
    });

    it("reads the current page from the URL", async () => {
      mockSearchParams = new URLSearchParams("page=3");
      const requests = stubServices([makeServiceRow("s1", "Гарантія 2 роки")], {
        total: 140,
        page: 3,
        limit: 20,
        totalPages: 7,
      });

      renderWithProviders(<AddonServiceTable />);
      await screen.findByText("Гарантія 2 роки");

      expect(requests[0].searchParams.get("page")).toBe("3");
    });
  });
});
