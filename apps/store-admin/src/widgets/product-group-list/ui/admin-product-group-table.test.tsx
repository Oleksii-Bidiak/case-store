/**
 * `AdminProductGroupTable` — TASK-357.
 *
 * This table had no toolbar, no search, no paging and no refresh: it read every
 * product group in one shot and rendered whatever came back. The cases below pin
 * the controls it grew, and — just as importantly — that it now asks the server
 * for a BOUNDED slice, because the failure mode being fixed was invisible: the
 * table never said anything was missing.
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
import { AdminProductGroupTable } from "./admin-product-group-table";

// jsdom mounts no app router; the table reads page + search from the URL and
// writes them back, so both ends need a stub.
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/product-groups",
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
});

function makeGroupRow(id: string, name: string, isActive = true) {
  return {
    id,
    name,
    isActive,
    axes: [{ name: "Колір", sortOrder: 0 }],
    positionCount: 3,
  };
}

/** Stub the list and hand back the recorded request URLs. */
function stubGroups(
  rows: ReturnType<typeof makeGroupRow>[],
  meta?: { total: number; page: number; limit: number; totalPages: number },
) {
  const requests: URL[] = [];
  server.use(
    http.get("*/api/product-groups", ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({
        data: rows,
        meta: meta ?? { total: rows.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
  return requests;
}

const g = dict.productGroups;
const OWNER = { auth: { isOwner: true } };

describe("AdminProductGroupTable", () => {
  it("renders group rows: the name opens the group, axes as badges, positions, status", async () => {
    stubGroups([
      makeGroupRow("g1", "Чохли iPhone 15"),
      { ...makeGroupRow("g2", "Кабель Hoco", false), positionCount: 0 },
    ]);

    renderWithProviders(<AdminProductGroupTable />, OWNER);

    expect(
      await screen.findByRole("link", { name: "Чохли iPhone 15" }),
    ).toHaveAttribute("href", "/product-groups/g1/edit");
    expect(screen.getAllByText("Колір").length).toBeGreaterThan(0);
    expect(screen.getByText("3")).toBeInTheDocument();
    // A group with no positions shows nothing on the site — say so.
    expect(screen.getByText(g.noPositions)).toBeInTheDocument();
    expect(screen.getByText(g.statusActive)).toBeInTheDocument();
    expect(screen.getByText(g.statusInactive)).toBeInTheDocument();
  });

  it("explains what a group is and offers «Додати групу» with products:write", async () => {
    stubGroups([makeGroupRow("g1", "Чохли iPhone 15")]);

    renderWithProviders(<AdminProductGroupTable />, OWNER);
    await screen.findByRole("link", { name: "Чохли iPhone 15" });

    expect(
      screen.getByRole("heading", { name: g.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(g.intro)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: g.add })).toHaveAttribute(
      "href",
      "/product-groups/new",
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.common.registry.rowActionsAria("Чохли iPhone 15"),
      }),
    );
    expect(
      screen.getByRole("menuitem", { name: dict.common.edit }),
    ).toHaveAttribute("href", "/product-groups/g1/edit");
  });

  it("without products:write hides «Додати групу» and the row actions (TASK-1011)", async () => {
    stubGroups([makeGroupRow("g1", "Чохли iPhone 15")]);

    renderWithProviders(<AdminProductGroupTable />, {
      auth: { permissions: ["products:read"] },
    });

    // The group still opens — read-only.
    expect(
      await screen.findByRole("link", { name: "Чохли iPhone 15" }),
    ).toHaveAttribute("href", "/product-groups/g1/edit");
    expect(screen.getByText(g.viewOnly)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: g.add })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: dict.common.registry.rowActionsAria("Чохли iPhone 15"),
      }),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no groups", async () => {
    stubGroups([]);

    renderWithProviders(<AdminProductGroupTable />);

    expect(
      await screen.findByText(dict.productGroups.empty),
    ).toBeInTheDocument();
  });

  it("shows the error state when the request fails", async () => {
    server.use(
      http.get(
        "*/api/product-groups",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    renderWithProviders(<AdminProductGroupTable />);

    expect(
      await screen.findByText(dict.productGroups.loadError),
    ).toBeInTheDocument();
    // The state where a refresh matters most must not hide the control.
    expect(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    ).toBeInTheDocument();
  });

  describe("toolbar, paging and refresh (TASK-357)", () => {
    it("asks for a bounded page instead of the whole table", async () => {
      const requests = stubGroups([makeGroupRow("g1", "Чохли iPhone 15")]);

      renderWithProviders(<AdminProductGroupTable />);
      await screen.findByRole("link", { name: "Чохли iPhone 15" });

      expect(requests[0].searchParams.get("limit")).toBe("20");
      expect(requests[0].searchParams.get("page")).toBe("1");
    });

    it("offers page controls when the server reports more than one page", async () => {
      stubGroups([makeGroupRow("g1", "Чохли iPhone 15")], {
        total: 90,
        page: 1,
        limit: 20,
        totalPages: 5,
      });

      renderWithProviders(<AdminProductGroupTable />);
      await screen.findByRole("link", { name: "Чохли iPhone 15" });

      expect(screen.getByText(dict.common.pageOf(1, 5))).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: dict.common.next }),
      );

      expect(mockReplace).toHaveBeenCalledWith("/product-groups?page=2");
    });

    it("refetches on demand — the point of the refresh control", async () => {
      const requests = stubGroups([makeGroupRow("g1", "Чохли iPhone 15")]);

      renderWithProviders(<AdminProductGroupTable />);
      await screen.findByRole("link", { name: "Чохли iPhone 15" });
      expect(requests).toHaveLength(1);

      await userEvent.click(
        screen.getByRole("button", { name: dict.common.table.refreshAria }),
      );

      await waitFor(() => expect(requests).toHaveLength(2));
    });

    it("passes the URL search through to the server", async () => {
      mockSearchParams = new URLSearchParams("search=iphone");
      const requests = stubGroups([makeGroupRow("g1", "Чохли iPhone 15")]);

      renderWithProviders(<AdminProductGroupTable />);
      await screen.findByRole("link", { name: "Чохли iPhone 15" });

      expect(requests[0].searchParams.get("search")).toBe("iphone");
    });
  });
});
