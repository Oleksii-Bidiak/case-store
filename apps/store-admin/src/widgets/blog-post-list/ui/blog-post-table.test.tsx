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
    scheduledAt: null,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

function stubPosts(rows: ReturnType<typeof makePostRow>[]) {
  server.use(
    http.get("*/api/admin/blog/posts", () =>
      HttpResponse.json({
        data: rows,
        meta: { total: rows.length, page: 1, limit: 100, totalPages: 1 },
      }),
    ),
  );
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
});
