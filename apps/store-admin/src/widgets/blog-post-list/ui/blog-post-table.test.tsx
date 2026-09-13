import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { BlogPostTable } from "./blog-post-table";

// jsdom mounts no app router, and since TASK-357 this table reads page + search
// from the URL and writes them back — so both ends need a stub.
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/blog",
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
});

function makePostRow(
  id: string,
  title: string,
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED",
  featured = false,
) {
  return {
    id,
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    title,
    excerpt: "Short",
    content: "<p>Body</p>",
    coverImageUrl: null,
    coverBlurDataUrl: null,
    authorName: "Author",
    readingMinutes: 5,
    featured,
    category: { id: "cat-1", slug: "guides", name: "Гайди" },
    status,
    publishedAt: status === "PUBLISHED" ? "2026-06-01T09:00:00.000Z" : null,
    // Widened: the TASK-430 scheduled-badge tests override this with a date.
    scheduledAt: null as string | null,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

/**
 * Stub the list and hand back the recorded request URLs, so a test can assert
 * WHAT the table asked for — the TASK-357 bug was in the request (`limit: 100`
 * with no page control), never in the response.
 */
function stubPosts(
  rows: ReturnType<typeof makePostRow>[],
  meta?: { total: number; page: number; limit: number; totalPages: number },
) {
  const requests: URL[] = [];
  server.use(
    http.get("*/api/admin/blog/posts", ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({
        data: rows,
        meta: meta ?? { total: rows.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
  return requests;
}

describe("BlogPostTable", () => {
  it("renders post rows with title, category, and status badge", async () => {
    stubPosts([
      makePostRow("p1", "iPhone 16", "PUBLISHED", true),
      makePostRow("p2", "Draft One", "DRAFT"),
    ]);

    renderWithProviders(<BlogPostTable />);

    await waitFor(() =>
      expect(screen.getByText("iPhone 16")).toBeInTheDocument(),
    );
    expect(screen.getByText("Draft One")).toBeInTheDocument();
    // Category name shows in the row.
    expect(screen.getAllByText("Гайди").length).toBeGreaterThanOrEqual(1);
    // Published badge + draft badge labels.
    expect(
      screen.getByText(dict.blogPosts.statusPublished),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.blogPosts.statusDraft)).toBeInTheDocument();
  });

  it("shows the empty state when there are no posts", async () => {
    stubPosts([]);

    renderWithProviders(<BlogPostTable />);

    await waitFor(() =>
      expect(screen.getByText(dict.blogPosts.empty)).toBeInTheDocument(),
    );
  });

  it("shows an error message when the request fails", async () => {
    server.use(
      http.get("*/api/admin/blog/posts", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    renderWithProviders(<BlogPostTable />);

    await waitFor(() =>
      expect(screen.getByText(dict.blogPosts.loadError)).toBeInTheDocument(),
    );
  });

  // TASK-285: the delete-confirm copy warns about the Google index only for a
  // currently-published row.
  /**
   * TASK-430 — «Заплановано» alone left the operator to open the post to find out
   * WHEN, and wore the same grey as a draft.
   */
  describe("scheduled badge (TASK-430)", () => {
    it("shows the scheduled date", async () => {
      stubPosts([
        {
          ...makePostRow("p3", "Friday Post", "SCHEDULED"),
          scheduledAt: "2026-09-19T08:00:00.000Z",
        },
      ]);

      renderWithProviders(<BlogPostTable />);

      expect(
        await screen.findByText(dict.blogPosts.statusScheduledOn("19.09.2026")),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(dict.blogPosts.statusDraft),
      ).not.toBeInTheDocument();
    });

    it("falls back to «Заплановано» with no instant, never «Invalid Date»", async () => {
      stubPosts([makePostRow("p4", "No Date", "SCHEDULED")]);

      renderWithProviders(<BlogPostTable />);

      expect(
        await screen.findByText(dict.blogPosts.statusScheduled),
      ).toBeInTheDocument();
    });
  });

  describe("delete confirm copy (TASK-285)", () => {
    let confirmSpy: jest.SpyInstance;

    beforeEach(() => {
      confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    });

    afterEach(() => {
      confirmSpy.mockRestore();
    });

    it("appends the still-may-be-indexed warning for a published post", async () => {
      stubPosts([makePostRow("p1", "iPhone 16", "PUBLISHED")]);
      renderWithProviders(<BlogPostTable />);
      const deleteButton = await screen.findByRole("button", {
        name: dict.common.delete,
      });

      await userEvent.click(deleteButton);

      expect(confirmSpy).toHaveBeenCalledWith(
        dict.blogPosts.deleteConfirm("iPhone 16", true),
      );
      expect(confirmSpy.mock.calls[0][0]).toContain("пошуковому індексі");
    });

    it("omits the indexed warning for a draft post", async () => {
      stubPosts([makePostRow("p2", "Draft One", "DRAFT")]);
      renderWithProviders(<BlogPostTable />);
      const deleteButton = await screen.findByRole("button", {
        name: dict.common.delete,
      });

      await userEvent.click(deleteButton);

      expect(confirmSpy).toHaveBeenCalledWith(
        dict.blogPosts.deleteConfirm("Draft One", false),
      );
      expect(confirmSpy.mock.calls[0][0]).not.toContain("пошуковому індексі");
    });
  });

  // TASK-357: the table asked for `limit: 100` and rendered no page controls,
  // so post 101 existed on the server and nowhere in the panel.
  describe("no more silent truncation (TASK-357)", () => {
    it("no longer asks for a 100-row slab", async () => {
      const requests = stubPosts([makePostRow("p1", "iPhone 16", "PUBLISHED")]);

      renderWithProviders(<BlogPostTable />);
      await screen.findByText("iPhone 16");

      expect(requests[0].searchParams.get("limit")).not.toBe("100");
      expect(requests[0].searchParams.get("limit")).toBe("20");
    });

    it("shows a reachable control past the page boundary instead of nothing", async () => {
      stubPosts([makePostRow("p1", "iPhone 16", "PUBLISHED")], {
        total: 260,
        page: 1,
        limit: 20,
        totalPages: 13,
      });

      renderWithProviders(<BlogPostTable />);
      await screen.findByText("iPhone 16");

      expect(screen.getByText(dict.common.pageOf(1, 13))).toBeInTheDocument();
      const next = screen.getByRole("button", { name: dict.common.next });
      expect(next).toBeEnabled();

      await userEvent.click(next);

      expect(mockReplace).toHaveBeenCalledWith("/blog?page=2");
    });

    it("refetches on demand — the point of the refresh control", async () => {
      const requests = stubPosts([makePostRow("p1", "iPhone 16", "PUBLISHED")]);

      renderWithProviders(<BlogPostTable />);
      await screen.findByText("iPhone 16");
      expect(requests).toHaveLength(1);

      await userEvent.click(
        screen.getByRole("button", { name: dict.common.table.refreshAria }),
      );

      await waitFor(() => expect(requests).toHaveLength(2));
    });

    // The URL key is `search` (every admin table uses it) but the wire key is
    // `q` — this endpoint named it that long before the toolbar existed.
    it("sends the URL's ?search= as the API's `q`", async () => {
      mockSearchParams = new URLSearchParams("search=iphone");
      const requests = stubPosts([makePostRow("p1", "iPhone 16", "PUBLISHED")]);

      renderWithProviders(<BlogPostTable />);
      await screen.findByText("iPhone 16");

      expect(requests[0].searchParams.get("q")).toBe("iphone");
      expect(requests[0].searchParams.get("search")).toBeNull();
    });
  });
});
