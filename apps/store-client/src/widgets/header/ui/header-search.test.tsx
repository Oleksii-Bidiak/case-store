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

describe("HeaderSearch — APG combobox ARIA contract (TASK-275)", () => {
  /** All options in combined order: products first, then blog posts. */
  function combinedOptions() {
    const products = within(
      screen.getByRole("listbox", { name: dict.search.inputAria }),
    ).queryAllByRole("option");
    const blogList = screen.queryByRole("listbox", {
      name: dict.search.blogSectionLabel,
    });
    const posts = blogList ? within(blogList).queryAllByRole("option") : [];
    return [...products, ...posts];
  }

  it("has no aria-activedescendant while the listbox is closed", async () => {
    setupHandlers({ products: [makeSuggestion()], posts: [] });

    renderWithProviders(<HeaderSearch />);
    const input = screen.getByRole("combobox", { name: dict.search.inputAria });

    // Nothing typed yet → collapsed, so the attribute must be absent (not "").
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });

  it("gives every option a unique id and points aria-controls at the listboxes", async () => {
    setupHandlers({
      products: [makeSuggestion()],
      posts: [makeBlogPost()],
    });

    const { input } = await typeQuery("чохол");
    await screen.findByRole("listbox", { name: dict.search.blogSectionLabel });

    const ids = combinedOptions().map((option) => option.id);
    expect(ids).toHaveLength(2);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);

    const productList = screen.getByRole("listbox", {
      name: dict.search.inputAria,
    });
    const blogList = screen.getByRole("listbox", {
      name: dict.search.blogSectionLabel,
    });
    expect(input.getAttribute("aria-controls")).toBe(
      `${productList.id} ${blogList.id}`,
    );
    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  it("still has no aria-activedescendant when the list is open but nothing is highlighted", async () => {
    setupHandlers({ products: [makeSuggestion()], posts: [] });

    const { input } = await typeQuery("чохол");
    await screen.findByText("Чохол iPhone 15 Pro");

    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });

  it("tracks the highlighted option's id through ArrowDown/ArrowUp across both listboxes", async () => {
    setupHandlers({
      products: [
        makeSuggestion(),
        makeSuggestion({ id: "product-2", name: "Скло", slug: "glass" }),
      ],
      posts: [makeBlogPost()],
    });

    const { user, input } = await typeQuery("чохол");
    await screen.findByRole("listbox", { name: dict.search.blogSectionLabel });

    const options = combinedOptions();
    expect(options).toHaveLength(3);

    // Each ArrowDown moves the ARIA pointer in lockstep with the visual
    // highlight (aria-selected) — one source of truth, both listboxes.
    for (const option of options) {
      await user.keyboard("{ArrowDown}");
      expect(input).toHaveAttribute("aria-activedescendant", option.id);
      expect(option).toHaveAttribute("aria-selected", "true");
      // Focus never leaves the input — that is the point of activedescendant.
      expect(input).toHaveFocus();
    }

    // ArrowUp walks back up the same combined list.
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id);
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[2]).toHaveAttribute("aria-selected", "false");
  });

  it("selects the option named by aria-activedescendant on Enter", async () => {
    setupHandlers({
      products: [
        makeSuggestion(),
        makeSuggestion({ id: "product-2", name: "Скло", slug: "glass" }),
      ],
      posts: [],
    });

    const { user, input } = await typeQuery("чохол");
    await screen.findByText("Скло");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    const activeId = input.getAttribute("aria-activedescendant");
    const active = combinedOptions().find((option) => option.id === activeId);
    expect(active).toHaveTextContent("Скло");

    await user.keyboard("{Enter}");
    expect(mockPush).toHaveBeenCalledWith("/products/glass");
  });

  it("drops aria-activedescendant when the listbox is closed with Escape", async () => {
    setupHandlers({ products: [makeSuggestion()], posts: [] });

    const { user, input } = await typeQuery("чохол");
    await screen.findByText("Чохол iPhone 15 Pro");

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant");

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("listbox", { name: dict.search.inputAria }),
    ).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });
});
