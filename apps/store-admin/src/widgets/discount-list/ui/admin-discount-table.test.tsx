/**
 * `AdminDiscountTable` — first tests, TASK-357 (covering TASK-355's work).
 *
 * TASK-355 wired this table to the server-side sort that `DiscountListQueryDto`
 * had accepted since TASK-147 and that the table had simply never used. That was
 * the cheapest win in plan 168 §2 — and it shipped with no widget test at all, so
 * nothing checked that the URL, the column headers and the outgoing request agree
 * with one another.
 *
 * Every assertion here is on the REQUEST, not the rendered rows: a sort control
 * that looks right while sending `sortBy=` for a field the DTO's `@IsIn` rejects
 * would render identically and fail with a 400 in production.
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
import { AdminDiscountTable } from "./admin-discount-table";

// jsdom mounts no app router; this table reads search/page/sort from the URL and
// writes them back, so both ends need a stub. Since TASK-358 every table writes
// through `useUrlParams`, i.e. `replace` — search, sort and page are view state,
// not history — so the assertions below read the replaced URL. Still shareable:
// the URL carries the whole view either way.
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/discounts",
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
});

function makeDiscountRow(
  id: string,
  code: string,
  overrides: Partial<{
    type: "PERCENT" | "FIXED";
    value: string;
    redeemedCount: number;
    maxRedemptions: number | null;
    expiresAt: string | null;
    isActive: boolean;
  }> = {},
) {
  return {
    id,
    code,
    type: overrides.type ?? "PERCENT",
    value: overrides.value ?? "10",
    minSpend: null,
    maxRedemptions:
      overrides.maxRedemptions === undefined ? null : overrides.maxRedemptions,
    perUserLimit: null,
    redeemedCount: overrides.redeemedCount ?? 0,
    startsAt: null,
    expiresAt: overrides.expiresAt ?? null,
    isActive: overrides.isActive ?? true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

/**
 * Stub the list and hand back the recorded request URLs, so a test can assert
 * WHAT the table asked for.
 */
function stubDiscounts(
  rows: ReturnType<typeof makeDiscountRow>[],
  meta?: { total: number; page: number; limit: number; totalPages: number },
) {
  const requests: URL[] = [];
  server.use(
    http.get("*/api/admin/discounts", ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({
        data: rows,
        meta: meta ?? { total: rows.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
  return requests;
}

describe("AdminDiscountTable", () => {
  it("renders discount rows with code, value and redemption count", async () => {
    stubDiscounts([
      makeDiscountRow("d1", "SUMMER10", {
        redeemedCount: 3,
        maxRedemptions: 50,
      }),
      makeDiscountRow("d2", "FIXED50", { type: "FIXED", value: "50.00" }),
    ]);

    renderWithProviders(<AdminDiscountTable />);

    await waitFor(() =>
      expect(screen.getByText("SUMMER10")).toBeInTheDocument(),
    );
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("₴50.00")).toBeInTheDocument();
    expect(
      screen.getByText(dict.discounts.redeemedOf(3, 50)),
    ).toBeInTheDocument();
  });

  it("shows the search-specific empty state when a search matched nothing", async () => {
    mockSearchParams = new URLSearchParams("search=nope");
    stubDiscounts([]);

    renderWithProviders(<AdminDiscountTable />);

    expect(
      await screen.findByText(dict.discounts.emptyMatch("nope")),
    ).toBeInTheDocument();
  });

  // ─── server sorting (TASK-355) ────────────────────────────────────────────
  describe("server sorting", () => {
    it("defaults to createdAt desc — the ordering the table used to hard-code", async () => {
      const requests = stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

      renderWithProviders(<AdminDiscountTable />);
      await screen.findByText("SUMMER10");

      expect(requests[0].searchParams.get("sortBy")).toBe("createdAt");
      expect(requests[0].searchParams.get("sortOrder")).toBe("desc");
    });

    it("sends the URL's sort straight through to the server", async () => {
      mockSearchParams = new URLSearchParams("sortBy=code&sortOrder=asc");
      const requests = stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

      renderWithProviders(<AdminDiscountTable />);
      await screen.findByText("SUMMER10");

      expect(requests[0].searchParams.get("sortBy")).toBe("code");
      expect(requests[0].searchParams.get("sortOrder")).toBe("asc");
    });

    // The sort is a URL navigation, not local state — that is what makes it
    // survive a reload and be pasteable to a colleague.
    it("writes a new sort field to the URL, descending first", async () => {
      stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

      renderWithProviders(<AdminDiscountTable />);
      await screen.findByText("SUMMER10");

      await userEvent.click(
        screen.getByRole("button", {
          name: dict.common.sortByAria(dict.discounts.colCode),
        }),
      );

      expect(mockReplace).toHaveBeenCalledWith(
        "/discounts?sortBy=code&sortOrder=desc",
      );
    });

    it("toggles to ascending when the active field is clicked again", async () => {
      mockSearchParams = new URLSearchParams("sortBy=code&sortOrder=desc");
      stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

      renderWithProviders(<AdminDiscountTable />);
      await screen.findByText("SUMMER10");

      await userEvent.click(
        screen.getByRole("button", {
          name: dict.common.sortByAria(dict.discounts.colCode),
        }),
      );

      expect(mockReplace).toHaveBeenCalledWith(
        "/discounts?sortBy=code&sortOrder=asc",
      );
    });

    // Re-sorting a list you are 4 pages into must land you on page 1, or the
    // rows you see belong to neither the old ordering nor the new one.
    it("drops the current page when the sort changes", async () => {
      mockSearchParams = new URLSearchParams("page=4");
      stubDiscounts([makeDiscountRow("d1", "SUMMER10")], {
        total: 140,
        page: 4,
        limit: 20,
        totalPages: 7,
      });

      renderWithProviders(<AdminDiscountTable />);
      await screen.findByText("SUMMER10");

      await userEvent.click(
        screen.getByRole("button", {
          name: dict.common.sortByAria(dict.discounts.colExpires),
        }),
      );

      expect(mockReplace).toHaveBeenCalledWith(
        "/discounts?sortBy=expiresAt&sortOrder=desc",
      );
    });

    it("marks the active column with aria-sort and leaves the others neutral", async () => {
      mockSearchParams = new URLSearchParams(
        "sortBy=redeemedCount&sortOrder=asc",
      );
      stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

      renderWithProviders(<AdminDiscountTable />);
      await screen.findByText("SUMMER10");

      expect(
        screen.getByRole("columnheader", { name: dict.discounts.colRedeemed }),
      ).toHaveAttribute("aria-sort", "ascending");
      expect(
        screen.getByRole("columnheader", { name: dict.discounts.colCode }),
      ).toHaveAttribute("aria-sort", "none");
    });

    // Only the four keys `DiscountListQueryDto`'s `@IsIn` accepts may ever reach
    // the wire; a fifth sortable column would 400 in production and render fine
    // in a snapshot.
    it("offers no sortable column the backend DTO would reject", async () => {
      stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

      renderWithProviders(<AdminDiscountTable />);
      await screen.findByText("SUMMER10");

      const sortable = screen
        .getAllByRole("columnheader")
        .filter((header) => header.getAttribute("aria-sort") !== null)
        .map((header) => header.textContent?.trim());

      expect(sortable).toEqual([
        dict.discounts.colCode,
        dict.discounts.colRedeemed,
        dict.discounts.colExpires,
      ]);
    });
  });

  // ─── toolbar (TASK-355 / plan 168 §4.1) ───────────────────────────────────
  describe("toolbar", () => {
    it("refetches on demand — the point of the refresh control", async () => {
      const requests = stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

      renderWithProviders(<AdminDiscountTable />);
      await screen.findByText("SUMMER10");
      expect(requests).toHaveLength(1);

      await userEvent.click(
        screen.getByRole("button", { name: dict.common.table.refreshAria }),
      );

      await waitFor(() => expect(requests).toHaveLength(2));
    });

    /**
     * The toolbar confirms a finished refresh through `aria-live`, which only
     * works inside a `LiveAnnouncer`. Without one `useAnnouncer()` falls back to
     * a no-op context and the confirmation is silently dropped — the refetch
     * still happens, so nothing on screen betrays it and only a screen-reader
     * user is affected. That is exactly how this table shipped in TASK-355.
     */
    it("confirms a finished refresh in the polite live region", async () => {
      stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

      renderWithProviders(<AdminDiscountTable />);
      await screen.findByText("SUMMER10");

      await userEvent.click(
        screen.getByRole("button", { name: dict.common.table.refreshAria }),
      );

      await waitFor(() =>
        expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
          dict.common.table.refreshed,
        ),
      );
    });

    it("submits the search box into the URL and resets the page", async () => {
      mockSearchParams = new URLSearchParams("page=3");
      stubDiscounts([makeDiscountRow("d1", "SUMMER10")], {
        total: 140,
        page: 3,
        limit: 20,
        totalPages: 7,
      });

      renderWithProviders(<AdminDiscountTable />);
      await screen.findByText("SUMMER10");

      await userEvent.type(
        screen.getByLabelText(dict.discounts.searchAria),
        "summer",
      );
      await userEvent.click(
        screen.getByRole("button", { name: dict.common.search }),
      );

      expect(mockReplace).toHaveBeenCalledWith("/discounts?search=summer");
    });

    it("forwards the URL search to the server", async () => {
      mockSearchParams = new URLSearchParams("search=summer");
      const requests = stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

      renderWithProviders(<AdminDiscountTable />);
      await screen.findByText("SUMMER10");

      expect(requests[0].searchParams.get("search")).toBe("summer");
      expect(requests[0].searchParams.get("limit")).toBe("20");
    });
  });
});
