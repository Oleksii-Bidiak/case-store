import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { BlogView } from "./blog-view";
import type { BlogPostView } from "../model/posts";

// next/navigation is unavailable under jsdom — mock the router.
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

function makePost(overrides: Partial<BlogPostView> = {}): BlogPostView {
  return {
    slug: "post-slug",
    categorySlug: "guides",
    categoryName: "Гайди",
    title: "Post title",
    excerpt: "Post excerpt",
    author: "Author Name",
    date: "28 черв. 2026",
    publishedAt: "2026-06-28T09:00:00.000Z",
    read: "6 хв",
    hue: 200,
    featured: false,
    coverImageUrl: null,
    content: "",
    ...overrides,
  };
}

const categories = [
  { slug: "reviews", name: "Огляди" },
  { slug: "guides", name: "Гайди" },
];

describe("BlogView", () => {
  beforeEach(() => mockPush.mockClear());

  it("renders the hero, featured card, grid cards, and chips", () => {
    renderWithProviders(
      <BlogView
        posts={[makePost({ slug: "a", title: "Grid Card A" })]}
        categories={categories}
        featured={makePost({
          slug: "f",
          title: "Featured Hero",
          featured: true,
        })}
        activeCategory="all"
        query=""
        page={1}
        totalPages={1}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: dict.blog.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.blog.badge)).toBeInTheDocument();
    expect(screen.getByText("Featured Hero")).toBeInTheDocument();
    expect(screen.getByText("Grid Card A")).toBeInTheDocument();
    // "all" chip + the two categories render as links.
    expect(
      screen.getByRole("link", { name: dict.blog.categories.all }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Огляди" })).toBeInTheDocument();
    // The newsletter block now hosts the real subscribe form (TASK-237).
    expect(
      screen.getByPlaceholderText(dict.newsletterForm.placeholder),
    ).toBeInTheDocument();
  });

  it("shows the empty state when there are no posts and no featured", () => {
    renderWithProviders(
      <BlogView
        posts={[]}
        categories={categories}
        featured={null}
        activeCategory="news"
        query="zzz"
        page={1}
        totalPages={1}
      />,
    );

    expect(screen.getByText(dict.blog.emptyHeading)).toBeInTheDocument();
  });

  it("offers the next-page shortcut only while a next page exists", () => {
    const { rerender } = renderWithProviders(
      <BlogView
        posts={[makePost()]}
        categories={categories}
        featured={null}
        activeCategory="all"
        query=""
        page={1}
        totalPages={3}
      />,
    );

    const next = screen.getByRole("link", { name: dict.blog.nextPageLink });
    expect(next).toHaveAttribute("href", "/blog?page=2");

    rerender(
      <BlogView
        posts={[makePost()]}
        categories={categories}
        featured={null}
        activeCategory="all"
        query=""
        page={1}
        totalPages={1}
      />,
    );
    expect(
      screen.queryByRole("link", { name: dict.blog.nextPageLink }),
    ).not.toBeInTheDocument();
  });

  // ── TASK-417: the shared numbered pagination ───────────────────────────────
  describe("pagination", () => {
    function renderPaged(page: number, totalPages: number, query = "") {
      return renderWithProviders(
        <BlogView
          posts={[makePost()]}
          categories={categories}
          featured={null}
          activeCategory="all"
          query={query}
          page={page}
          totalPages={totalPages}
        />,
      );
    }

    it("renders no pagination for a single page", () => {
      renderPaged(1, 1);

      expect(
        screen.queryByRole("navigation", { name: dict.blog.paginationAria }),
      ).not.toBeInTheDocument();
    });

    it("links every page and marks the current one", () => {
      renderPaged(2, 4);

      const nav = screen.getByRole("navigation", {
        name: dict.blog.paginationAria,
      });
      expect(nav).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "3" })).toHaveAttribute(
        "href",
        "/blog?page=3",
      );
      expect(screen.getByRole("link", { name: "2" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      // Page 1 keeps the canonical, page-less URL.
      expect(screen.getByRole("link", { name: "1" })).toHaveAttribute(
        "href",
        "/blog",
      );
    });

    it("carries the active category and query into every page href", () => {
      renderWithProviders(
        <BlogView
          posts={[makePost()]}
          categories={categories}
          featured={null}
          activeCategory="guides"
          query="павербанк"
          page={1}
          totalPages={3}
        />,
      );

      expect(screen.getByRole("link", { name: "2" })).toHaveAttribute(
        "href",
        "/blog?category=guides&q=%D0%BF%D0%B0%D0%B2%D0%B5%D1%80%D0%B1%D0%B0%D0%BD%D0%BA&page=2",
      );
    });

    it("drops the page when a category chip switches the selection", () => {
      renderPaged(3, 5);

      // A page 3 of the old selection means nothing in the new one.
      expect(screen.getByRole("link", { name: "Огляди" })).toHaveAttribute(
        "href",
        "/blog?category=reviews",
      );
    });
  });

  it("pushes a search query to the URL when typing", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BlogView
        posts={[makePost()]}
        categories={categories}
        featured={null}
        activeCategory="all"
        query=""
        page={1}
        totalPages={1}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(dict.blog.searchPlaceholder),
      "павербанк",
    );

    // The debounced push eventually fires with the query in the URL.
    await screen.findByDisplayValue("павербанк");
  });
});
