import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminPageTable } from "./admin-page-table";

// jsdom mounts no app router, and since TASK-357 this table reads page + search
// from the URL and writes them back — so both ends need a stub.
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/pages",
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
});

function makePageRow(
  id: string,
  title: string,
  isActive: boolean,
  slug = title.toLowerCase().replace(/\s+/g, "-"),
) {
  return {
    id,
    slug,
    title,
    content: "<p>Body</p>",
    excerpt: null,
    metaTitle: null,
    metaDescription: null,
    isActive,
    sortOrder: 0,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

/**
 * Stub the list and hand back the recorded request URLs, so a test can assert
 * WHAT the table asked for — the TASK-357 bug was in the request (`limit: 100`
 * with no page control), never in the response.
 */
function stubPages(
  rows: ReturnType<typeof makePageRow>[],
  meta?: { total: number; page: number; limit: number; totalPages: number },
) {
  const requests: URL[] = [];
  server.use(
    http.get("*/api/admin/pages", ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({
        data: rows,
        meta: meta ?? { total: rows.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
  return requests;
}

describe("AdminPageTable", () => {
  it("renders page rows with title, slug, and status badge", async () => {
    stubPages([
      makePageRow("page-1", "Privacy Policy", true, "privacy-policy"),
      makePageRow("page-2", "FAQ", false, "faq"),
    ]);

    renderWithProviders(<AdminPageTable />);

    await waitFor(() =>
      expect(screen.getByText("Privacy Policy")).toBeInTheDocument(),
    );
    expect(screen.getByText("privacy-policy")).toBeInTheDocument();
    expect(screen.getByText("FAQ")).toBeInTheDocument();
    expect(screen.getByText("faq")).toBeInTheDocument();
  });

  it("shows the published badge for active pages and draft for inactive", async () => {
    stubPages([
      makePageRow("page-1", "Privacy Policy", true),
      makePageRow("page-2", "FAQ", false),
    ]);

    renderWithProviders(<AdminPageTable />);

    await waitFor(() =>
      expect(screen.getByText(dict.pages.statusPublished)).toBeInTheDocument(),
    );
    expect(screen.getByText(dict.pages.statusDraft)).toBeInTheDocument();
  });

  it("renders an edit action linking to the page edit route", async () => {
    stubPages([makePageRow("page-1", "Privacy Policy", true)]);

    renderWithProviders(<AdminPageTable />);

    const editLink = await screen.findByRole("link", {
      name: dict.common.edit,
    });
    expect(editLink).toHaveAttribute("href", "/pages/page-1/edit");
  });

  // TASK-285: the delete-confirm copy warns about the Google index only for a
  // currently-published row.
  describe("delete confirm copy (TASK-285)", () => {
    let confirmSpy: jest.SpyInstance;

    beforeEach(() => {
      confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    });

    afterEach(() => {
      confirmSpy.mockRestore();
    });

    it("appends the still-may-be-indexed warning for a published page", async () => {
      stubPages([makePageRow("page-1", "Privacy Policy", true)]);
      renderWithProviders(<AdminPageTable />);
      const deleteButton = await screen.findByRole("button", {
        name: dict.common.delete,
      });

      await userEvent.click(deleteButton);

      expect(confirmSpy).toHaveBeenCalledWith(
        dict.pages.deleteConfirm("Privacy Policy", true),
      );
      expect(confirmSpy.mock.calls[0][0]).toContain("пошуковому індексі");
    });

    it("omits the indexed warning for a draft page", async () => {
      stubPages([makePageRow("page-2", "FAQ", false)]);
      renderWithProviders(<AdminPageTable />);
      const deleteButton = await screen.findByRole("button", {
        name: dict.common.delete,
      });

      await userEvent.click(deleteButton);

      expect(confirmSpy).toHaveBeenCalledWith(
        dict.pages.deleteConfirm("FAQ", false),
      );
      expect(confirmSpy.mock.calls[0][0]).not.toContain("пошуковому індексі");
    });
  });

  // TASK-357: the table asked for `limit: 100` and rendered no page controls,
  // so page 101 existed on the server and nowhere in the panel.
  describe("no more silent truncation (TASK-357)", () => {
    it("no longer asks for a 100-row slab", async () => {
      const requests = stubPages([
        makePageRow("page-1", "Privacy Policy", true),
      ]);

      renderWithProviders(<AdminPageTable />);
      await screen.findByText("Privacy Policy");

      expect(requests[0].searchParams.get("limit")).not.toBe("100");
      expect(requests[0].searchParams.get("limit")).toBe("20");
    });

    it("shows a reachable control past the page boundary instead of nothing", async () => {
      stubPages([makePageRow("page-1", "Privacy Policy", true)], {
        total: 140,
        page: 1,
        limit: 20,
        totalPages: 7,
      });

      renderWithProviders(<AdminPageTable />);
      await screen.findByText("Privacy Policy");

      expect(screen.getByText(dict.common.pageOf(1, 7))).toBeInTheDocument();
      const next = screen.getByRole("button", { name: dict.common.next });
      expect(next).toBeEnabled();

      await userEvent.click(next);

      expect(mockReplace).toHaveBeenCalledWith("/pages?page=2");
    });

    it("refetches on demand — the point of the refresh control", async () => {
      const requests = stubPages([
        makePageRow("page-1", "Privacy Policy", true),
      ]);

      renderWithProviders(<AdminPageTable />);
      await screen.findByText("Privacy Policy");
      expect(requests).toHaveLength(1);

      await userEvent.click(
        screen.getByRole("button", { name: dict.common.table.refreshAria }),
      );

      await waitFor(() => expect(requests).toHaveLength(2));
    });

    it("passes the URL search through to the server", async () => {
      mockSearchParams = new URLSearchParams("search=privacy");
      const requests = stubPages([
        makePageRow("page-1", "Privacy Policy", true),
      ]);

      renderWithProviders(<AdminPageTable />);
      await screen.findByText("Privacy Policy");

      expect(requests[0].searchParams.get("search")).toBe("privacy");
    });
  });
});
