import { http, HttpResponse, delay } from "msw";
import { act } from "@testing-library/react";
import {
  renderWithProviders,
  screen,
  within,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { BlogPostEntity } from "@/entities/blog";
import type { CategoryTreeNodeEntity } from "@/entities/category";
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

/** Build a category tree node with sensible defaults; override per-test. */
function makeTreeNode(
  overrides: Partial<CategoryTreeNodeEntity> = {},
): CategoryTreeNodeEntity {
  return {
    id: "cat-1",
    name: "Смартфони",
    slug: "phones",
    description: null,
    image: null,
    isActive: true,
    sortOrder: 0,
    metaTitle: null,
    metaDescription: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    children: [],
    ...overrides,
  };
}

/**
 * Default mega-menu fixture (TASK-082): two roots with children (the first
 * with two, so pane traversal is meaningful) plus one childless root.
 */
function makeTree(): CategoryTreeNodeEntity[] {
  return [
    makeTreeNode({
      children: [
        makeTreeNode({ id: "cat-1a", name: "Чохли", slug: "cases" }),
        makeTreeNode({ id: "cat-1b", name: "Скло", slug: "glass" }),
      ],
    }),
    makeTreeNode({
      id: "cat-2",
      name: "Аудіо",
      slug: "audio",
      sortOrder: 1,
      children: [
        makeTreeNode({ id: "cat-2a", name: "Навушники", slug: "headphones" }),
      ],
    }),
    makeTreeNode({
      id: "cat-3",
      name: "Кабелі",
      slug: "cables",
      sortOrder: 2,
    }),
  ];
}

/**
 * Wire the three endpoints `HeaderSearch` hits: the category tree (mega-menu,
 * fires on mount — TASK-082), product suggest, and the blog list (TASK-218).
 */
function setupHandlers({
  products = [],
  posts = [],
  categories = [],
}: {
  products?: SearchSuggestionEntity[];
  posts?: BlogPostEntity[];
  categories?: CategoryTreeNodeEntity[];
} = {}) {
  server.use(
    http.get("*/api/categories/tree", () =>
      HttpResponse.json({ data: categories }),
    ),
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

describe("HeaderSearch — mega-menu flyout (TASK-082)", () => {
  /** Render and open the "Каталог" panel. */
  async function openCatalog() {
    const user = userEvent.setup();
    renderWithProviders(<HeaderSearch />);
    await user.click(
      screen.getByRole("button", { name: dict.header.catalogAria }),
    );
    return { user };
  }

  /** The right pane (subcategories of the active root). */
  function subPane() {
    return screen.getByRole("group", {
      name: dict.header.catalogSubcategoriesAria,
    });
  }

  it("defaults the right pane to the first root's children on open", async () => {
    setupHandlers({ categories: makeTree() });
    await openCatalog();

    const first = await screen.findByRole("menuitem", { name: "Смартфони" });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(first).toHaveAttribute("aria-haspopup", "true");
    expect(screen.getByRole("menuitem", { name: "Аудіо" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // Childless root carries neither attribute.
    const childless = screen.getByRole("menuitem", { name: "Кабелі" });
    expect(childless).not.toHaveAttribute("aria-haspopup");
    expect(childless).not.toHaveAttribute("aria-expanded");

    const pane = subPane();
    expect(
      within(pane).getByRole("menuitem", { name: "Чохли" }),
    ).toHaveAttribute("href", "/categories/cases");
    expect(
      within(pane).getByRole("menuitem", { name: "Скло" }),
    ).toBeInTheDocument();
  });

  it("reveals another root's children on hover", async () => {
    setupHandlers({ categories: makeTree() });
    const { user } = await openCatalog();

    await user.hover(await screen.findByRole("menuitem", { name: "Аудіо" }));

    const pane = subPane();
    expect(
      within(pane).getByRole("menuitem", { name: "Навушники" }),
    ).toBeInTheDocument();
    expect(
      within(pane).queryByRole("menuitem", { name: "Чохли" }),
    ).not.toBeInTheDocument();
  });

  it("reveals another root's children on keyboard focus", async () => {
    setupHandlers({ categories: makeTree() });
    await openCatalog();

    const audio = await screen.findByRole("menuitem", { name: "Аудіо" });
    act(() => audio.focus());

    expect(
      within(subPane()).getByRole("menuitem", { name: "Навушники" }),
    ).toBeInTheDocument();
  });

  it("hides the right pane while a childless root is active", async () => {
    setupHandlers({ categories: makeTree() });
    const { user } = await openCatalog();

    await user.hover(await screen.findByRole("menuitem", { name: "Кабелі" }));

    expect(
      screen.queryByRole("group", {
        name: dict.header.catalogSubcategoriesAria,
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps a root-with-children navigating on click and closes the panel", async () => {
    setupHandlers({ categories: makeTree() });
    const { user } = await openCatalog();

    const first = await screen.findByRole("menuitem", { name: "Смартфони" });
    expect(first).toHaveAttribute("href", "/categories/phones");

    await user.click(first);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("moves focus between panes with ArrowRight/ArrowLeft", async () => {
    setupHandlers({ categories: makeTree() });
    const { user } = await openCatalog();

    const first = await screen.findByRole("menuitem", { name: "Смартфони" });
    act(() => first.focus());

    await user.keyboard("{ArrowRight}");
    const child = within(subPane()).getByRole("menuitem", { name: "Чохли" });
    expect(child).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(first).toHaveFocus();
  });

  it("returns focus to the trigger when Escape closes the panel", async () => {
    setupHandlers({ categories: makeTree() });
    const { user } = await openCatalog();
    await screen.findByRole("menuitem", { name: "Смартфони" });

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.header.catalogAria }),
    ).toHaveFocus();
  });

  it("shows skeleton rows while the tree is loading", async () => {
    server.use(
      http.get("*/api/categories/tree", async () => {
        await delay("infinite");
        return HttpResponse.json({ data: [] });
      }),
      http.get("*/api/search/suggest", () => HttpResponse.json({ data: [] })),
      http.get("*/api/blog", () => HttpResponse.json({ data: [], meta: {} })),
    );
    await openCatalog();

    // Skeletons live in an aria-hidden container — query the hidden tree.
    expect(screen.getAllByRole("status", { hidden: true })).toHaveLength(6);
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("shows the error state when the tree request fails", async () => {
    server.use(
      http.get("*/api/categories/tree", () =>
        HttpResponse.json(
          { error: "Internal", message: "boom", statusCode: 500 },
          { status: 500 },
        ),
      ),
      http.get("*/api/search/suggest", () => HttpResponse.json({ data: [] })),
      http.get("*/api/blog", () => HttpResponse.json({ data: [], meta: {} })),
    );
    await openCatalog();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.catalog.categoriesError,
    );
  });

  it("shows the empty state without a right pane when there are no roots", async () => {
    setupHandlers({ categories: [] });
    await openCatalog();

    expect(
      await screen.findByText(dict.catalog.noCategories),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", {
        name: dict.header.catalogSubcategoriesAria,
      }),
    ).not.toBeInTheDocument();
    // The "Усі категорії" footer link is still there.
    expect(
      screen.getByRole("menuitem", { name: dict.header.catalogAll }),
    ).toHaveAttribute("href", "/categories");
  });
});
