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
        hasMore={false}
        nextPageHref="/blog?page=2"
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
        hasMore={false}
        nextPageHref="/blog?category=news&q=zzz&page=2"
      />,
    );

    expect(screen.getByText(dict.blog.emptyHeading)).toBeInTheDocument();
  });

  it("renders the load-more link only when there are more posts", () => {
    const { rerender } = renderWithProviders(
      <BlogView
        posts={[makePost()]}
        categories={categories}
        featured={null}
        activeCategory="all"
        query=""
        hasMore
        nextPageHref="/blog?page=2"
      />,
    );

    const loadMore = screen.getByRole("link", { name: dict.blog.loadMore });
    expect(loadMore).toHaveAttribute("href", "/blog?page=2");

    rerender(
      <BlogView
        posts={[makePost()]}
        categories={categories}
        featured={null}
        activeCategory="all"
        query=""
        hasMore={false}
        nextPageHref="/blog?page=2"
      />,
    );
    expect(
      screen.queryByRole("link", { name: dict.blog.loadMore }),
    ).not.toBeInTheDocument();
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
        hasMore={false}
        nextPageHref="/blog?page=2"
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
