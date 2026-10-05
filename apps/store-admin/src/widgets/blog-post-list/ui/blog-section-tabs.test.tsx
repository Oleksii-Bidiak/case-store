import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, within } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { BlogSectionTabs } from "./blog-section-tabs";

const d = dict.blogPosts;

beforeEach(() => {
  server.use(
    http.get("*/api/admin/blog/posts", () =>
      HttpResponse.json({
        data: [],
        meta: { total: 12, page: 1, limit: 1, totalPages: 12 },
      }),
    ),
    http.get("*/api/admin/blog/categories", () =>
      HttpResponse.json({
        data: Array.from({ length: 5 }, (_, i) => ({
          id: `c${i}`,
          slug: `c${i}`,
          name: `Категорія ${i}`,
          sortOrder: i,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        })),
      }),
    ),
  );
});

describe("BlogSectionTabs (БЛ1, КБ1)", () => {
  it("links «Статті» and «Категорії» with their totals, the current one marked", async () => {
    renderWithProviders(<BlogSectionTabs active="categories" />);

    const nav = screen.getByRole("navigation", { name: d.sectionTabsAria });
    const posts = within(nav).getByRole("link", { name: /^Статті/ });
    const categories = within(nav).getByRole("link", { name: /^Категорії/ });

    expect(posts).toHaveAttribute("href", "/blog");
    expect(categories).toHaveAttribute("href", "/blog/categories");
    expect(categories).toHaveAttribute("aria-current", "page");
    expect(posts).not.toHaveAttribute("aria-current");

    expect(await within(posts).findByText("12")).toBeInTheDocument();
    expect(await within(categories).findByText("5")).toBeInTheDocument();
  });

  it("has no «Автори» tab — there is no authors API yet (TASK-1176)", () => {
    renderWithProviders(<BlogSectionTabs active="posts" />);

    expect(
      screen.queryByRole("link", { name: /^Автори/ }),
    ).not.toBeInTheDocument();
  });
});
