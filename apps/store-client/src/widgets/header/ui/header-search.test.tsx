import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  within,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { BlogPostEntity } from "@/entities/blog";
import type { SearchSuggestionEntity } from "@/entities/search";
import { HeaderSearch } from "./header-search";

// next/navigation is unavailable under jsdom — mock the router used by pick/submit.
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

beforeEach(() => {
  mockPush.mockClear();
});

/** Build a product suggestion with sensible defaults; override per-test. */
function makeSuggestion(
  overrides: Partial<SearchSuggestionEntity> = {},
): SearchSuggestionEntity {
  return {
    id: "product-1",
    name: "Чохол iPhone 15 Pro",
    slug: "iphone-15-pro-case",
    price: "499.00",
    compareAtPrice: null,
    primaryImageUrl: null,
    ...overrides,
  };
}

/** Build a published blog post with sensible defaults; override per-test. */
function makeBlogPost(overrides: Partial<BlogPostEntity> = {}): BlogPostEntity {
  return {
    id: "post-1",
    slug: "how-to-pick-a-case",
    title: "Як обрати чохол для iPhone",
    excerpt: "Гайд із вибору чохла.",
    content: "",
    coverImageUrl: null,
    coverBlurDataUrl: null,
    authorName: "Олег Пилипенко",
    readingMinutes: 6,
    featured: false,
    category: { id: "cat-1", slug: "guides", name: "Гайди" },
    status: "PUBLISHED",
    publishedAt: "2026-06-28T09:00:00.000Z",
    scheduledAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Wire the three endpoints `HeaderSearch` hits: root categories (mega-menu,
 * fires on mount), product suggest, and the blog list (TASK-218).
 */
function setupHandlers({
  products = [],
  posts = [],
}: {
  products?: SearchSuggestionEntity[];
  posts?: BlogPostEntity[];
} = {}) {
  server.use(
    http.get("*/api/categories", () => HttpResponse.json({ data: [] })),
    http.get("*/api/search/suggest", () =>
      HttpResponse.json({ data: products }),
    ),
    http.get("*/api/blog", () =>
      HttpResponse.json({
        data: posts,
        meta: { total: posts.length, page: 1, limit: 5, totalPages: 1 },
      }),
    ),
  );
}

/** Render, focus the search input, and type a query (debounced 250ms inside). */
async function typeQuery(text: string) {
  const user = userEvent.setup();
  renderWithProviders(<HeaderSearch />);
  const input = screen.getByRole("combobox", { name: dict.search.inputAria });
  await user.type(input, text);
  return { user, input };
}

describe("HeaderSearch — mixed product + blog suggestions (TASK-218)", () => {
  it("renders product suggestions without a blog section when no articles match", async () => {
    setupHandlers({
      products: [
        makeSuggestion(),
        makeSuggestion({ id: "product-2", name: "Скло", slug: "glass" }),
      ],
      posts: [],
    });

    await typeQuery("чохол");

    // Wait for the suggest response to land, not just for the (always
    // rendered) listbox shell with its loading/empty rows.
    await screen.findByText("Чохол iPhone 15 Pro");
    const productList = screen.getByRole("listbox", {
      name: dict.search.inputAria,
    });
    expect(within(productList).getAllByRole("option")).toHaveLength(2);

    expect(
      screen.queryByRole("listbox", { name: dict.search.blogSectionLabel }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(dict.search.blogSectionLabel),
    ).not.toBeInTheDocument();
  });

  it("renders the separator, heading, and a second listbox when articles match", async () => {
    setupHandlers({
      products: [makeSuggestion()],
      posts: [
        makeBlogPost(),
        makeBlogPost({ id: "post-2", slug: "magsafe-guide", title: "MagSafe" }),
      ],
    });

    await typeQuery("чохол");

    const blogList = await screen.findByRole("listbox", {
      name: dict.search.blogSectionLabel,
    });
    expect(within(blogList).getAllByRole("option")).toHaveLength(2);
    expect(
      within(blogList).getByText("Як обрати чохол для iPhone"),
    ).toBeInTheDocument();
    // Visible section heading.
    expect(screen.getByText(dict.search.blogSectionLabel)).toBeInTheDocument();
    // Product listbox is unaffected.
    const productList = screen.getByRole("listbox", {
      name: dict.search.inputAria,
    });
    expect(within(productList).getAllByRole("option")).toHaveLength(1);
  });

  it("caps the blog section at 5 articles", async () => {
    setupHandlers({
      products: [makeSuggestion()],
      posts: Array.from({ length: 6 }, (_, i) =>
        makeBlogPost({
          id: `post-${i}`,
          slug: `post-${i}`,
          title: `Стаття ${i}`,
        }),
      ),
    });

    await typeQuery("стаття");

    const blogList = await screen.findByRole("listbox", {
      name: dict.search.blogSectionLabel,
    });
    expect(within(blogList).getAllByRole("option")).toHaveLength(5);
  });

  it("navigates one combined list with arrow keys and opens a blog post on Enter", async () => {
    setupHandlers({
      products: [makeSuggestion()],
      posts: [makeBlogPost()],
    });

    const { user } = await typeQuery("чохол");

    const blogList = await screen.findByRole("listbox", {
      name: dict.search.blogSectionLabel,
    });
    const productOption = within(
      screen.getByRole("listbox", { name: dict.search.inputAria }),
    ).getByRole("option");
    const blogOption = within(blogList).getByRole("option");

    // ↓ highlights the (only) product first.
    await user.keyboard("{ArrowDown}");
    expect(productOption).toHaveAttribute("aria-selected", "true");
    expect(blogOption).toHaveAttribute("aria-selected", "false");

    // ↓ crosses the boundary into the first blog item.
    await user.keyboard("{ArrowDown}");
    expect(productOption).toHaveAttribute("aria-selected", "false");
    expect(blogOption).toHaveAttribute("aria-selected", "true");

    // ↑ crosses back to the last product.
    await user.keyboard("{ArrowUp}");
    expect(productOption).toHaveAttribute("aria-selected", "true");

    // ↓ + Enter on the blog item routes to the article page.
    await user.keyboard("{ArrowDown}{Enter}");
    expect(mockPush).toHaveBeenCalledWith("/blog/how-to-pick-a-case");
  });

  it("keeps Enter on a highlighted product routing to the product page", async () => {
    setupHandlers({
      products: [makeSuggestion()],
      posts: [makeBlogPost()],
    });

    const { user } = await typeQuery("чохол");

    await screen.findByRole("listbox", {
      name: dict.search.blogSectionLabel,
    });
    await user.keyboard("{ArrowDown}{Enter}");
    expect(mockPush).toHaveBeenCalledWith("/products/iphone-15-pro-case");
  });

  it("opens a blog post on click", async () => {
    setupHandlers({
      products: [makeSuggestion()],
      posts: [makeBlogPost()],
    });

    const { user } = await typeQuery("чохол");

    const blogList = await screen.findByRole("listbox", {
      name: dict.search.blogSectionLabel,
    });
    await user.click(within(blogList).getByRole("option"));
    expect(mockPush).toHaveBeenCalledWith("/blog/how-to-pick-a-case");
  });
});
