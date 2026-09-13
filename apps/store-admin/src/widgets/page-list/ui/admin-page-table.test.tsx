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
  kind: "LEGAL" | "INFO" | "HUB" = "LEGAL",
) {
  return {
    id,
    slug,
    kind,
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

// TASK-435 — one screen, three kinds of row. Without the tabs and the badge, a
// hub meta card and a legal document look identical in the list.
describe("AdminPageTable — kind tabs", () => {
  it("labels each row with its kind", async () => {
    stubPages([
      makePageRow("page-1", "Публічна оферта", true, "offer", "LEGAL"),
      makePageRow("page-2", "Про нас", true, "about", "INFO"),
      makePageRow("page-3", "Розділ «Блог»", true, "blog", "HUB"),
    ]);

    renderWithProviders(<AdminPageTable />);

    await waitFor(() =>
      expect(screen.getByText("Публічна оферта")).toBeInTheDocument(),
    );
    expect(screen.getByText(dict.pages.kindLegal)).toBeInTheDocument();
    expect(screen.getByText(dict.pages.kindInfo)).toBeInTheDocument();
    expect(screen.getByText(dict.pages.kindHub)).toBeInTheDocument();
  });

  it("asks for no kind at all on the «Усі» tab", async () => {
    const requests = stubPages([makePageRow("page-1", "Оферта", true)]);

    renderWithProviders(<AdminPageTable />);

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].searchParams.get("kind")).toBeNull();
  });

  it("writes ?kind= to the URL when a tab is clicked, and resets the page", async () => {
    stubPages([makePageRow("page-1", "Оферта", true)]);
    mockSearchParams = new URLSearchParams("page=3");

    renderWithProviders(<AdminPageTable />);
    await waitFor(() => expect(screen.getByText("Оферта")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: dict.pages.tabHub }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    const written = mockReplace.mock.calls.at(-1)?.[0] as string;
    expect(written).toContain("kind=HUB");
    // Paging back to a page that may not exist under the new filter is the
    // classic way a filtered list lands on "порожньо" that is not true.
    expect(written).not.toContain("page=3");
  });

  it("sends the kind from the URL to the API and marks that tab active", async () => {
    mockSearchParams = new URLSearchParams("kind=INFO");
    const requests = stubPages([
      makePageRow("page-2", "Про нас", true, "about", "INFO"),
    ]);

    renderWithProviders(<AdminPageTable />);

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].searchParams.get("kind")).toBe("INFO");
    expect(
      screen.getByRole("tab", { name: dict.pages.tabInfo }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("drops a bogus ?kind= rather than sending it, and highlights no tab", async () => {
    // The API validates the enum, so passing "БУДЬ-ЩО" through would turn a
    // stale bookmark into a 400 and an error screen instead of a list.
    mockSearchParams = new URLSearchParams("kind=NOT_A_KIND");
    const requests = stubPages([makePageRow("page-1", "Оферта", true)]);

    renderWithProviders(<AdminPageTable />);

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].searchParams.get("kind")).toBeNull();
    for (const label of [
      dict.pages.tabAll,
      dict.pages.tabLegal,
      dict.pages.tabInfo,
      dict.pages.tabHub,
    ]) {
      expect(screen.getByRole("tab", { name: label })).toHaveAttribute(
        "aria-selected",
        "false",
      );
    }
  });

  it("says WHICH kind is empty when a filtered tab has no rows", async () => {
    mockSearchParams = new URLSearchParams("kind=HUB");
    stubPages([], { total: 0, page: 1, limit: 20, totalPages: 0 });

    renderWithProviders(<AdminPageTable />);

    expect(await screen.findByText(dict.pages.emptyKind)).toBeInTheDocument();
    expect(screen.queryByText(dict.pages.empty)).not.toBeInTheDocument();
  });
});
