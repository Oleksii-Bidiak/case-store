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

describe("HeaderSearch — hover, Enter and the compact trigger (TASK-411)", () => {
  /** The product listbox itself (the one named by the input's aria-label). */
  function productList() {
    return screen.getByRole("listbox", { name: dict.search.inputAria });
  }

  it("leaves the keyboard selection alone when the pointer crosses an option", async () => {
    setupHandlers({
      products: [
        makeSuggestion(),
        makeSuggestion({ id: "product-2", name: "Скло", slug: "glass" }),
      ],
    });

    const { user, input } = await typeQuery("чохол");
    await screen.findByText("Скло");
    const [first, second] = within(productList()).getAllByRole("option");

    // Hovering the SECOND row tints it (CSS only) but must not select it.
    await user.hover(second);
    expect(second).toHaveAttribute("aria-selected", "false");
    expect(input).not.toHaveAttribute("aria-activedescendant");

    // So the first ArrowDown still lands on the FIRST row, and Enter commits
    // that one — not whatever the cursor happens to be resting on.
    await user.keyboard("{ArrowDown}");
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", first.id);

    await user.keyboard("{Enter}");
    expect(mockPush).toHaveBeenCalledWith("/products/iphone-15-pro-case");
  });

  it("sends Enter with nothing highlighted to the results page", async () => {
    setupHandlers({ products: [makeSuggestion()] });

    const { user } = await typeQuery("чохол");
    await screen.findByText("Чохол iPhone 15 Pro");

    // The popup is open and has matches, but the user arrowed to none of them
    // — Enter must search for what was typed rather than do nothing.
    await user.keyboard("{Enter}");
    expect(mockPush).toHaveBeenCalledWith(
      `/search?q=${encodeURIComponent("чохол")}`,
    );
  });

  it("turns an empty popup into a link to the full results page", async () => {
    setupHandlers({ products: [], posts: [] });

    await typeQuery("невідомо");

    const link = await screen.findByRole("link", {
      name: dict.search.showAllResults("невідомо"),
    });
    expect(link).toHaveAttribute(
      "href",
      `/search?q=${encodeURIComponent("невідомо")}`,
    );
    // It is a way OUT of the popup, not one of its rows: a focusable link is
    // not a valid child of role="listbox".
    expect(within(productList()).queryAllByRole("option")).toHaveLength(0);
    expect(within(productList()).queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not claim 'nothing found' when only articles match", async () => {
    setupHandlers({ products: [], posts: [makeBlogPost()] });

    await typeQuery("чохол");

    await screen.findByRole("listbox", { name: dict.search.blogSectionLabel });
    expect(screen.queryByText(dict.search.empty)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: dict.search.showAllResults("чохол") }),
    ).not.toBeInTheDocument();
  });

  it("keeps the popup on the loading row while the debounce is still pending", async () => {
    server.use(
      http.get("*/api/categories/tree", () => HttpResponse.json({ data: [] })),
      http.get("*/api/search/suggest", async () => {
        await delay("infinite");
        return HttpResponse.json({ data: [] });
      }),
      http.get("*/api/blog", async () => {
        await delay("infinite");
        return HttpResponse.json({ data: [], meta: {} });
      }),
    );

    await typeQuery("ч");

    // The request for "ч" has not even been sent yet (250ms debounce), so
    // nothing is in flight and nothing has arrived — the popup must not
    // announce a verdict it cannot have.
    expect(screen.getByText(dict.search.loading)).toBeInTheDocument();
    expect(screen.queryByText(dict.search.empty)).not.toBeInTheDocument();
  });

  it("opens a search panel from the magnifier and returns focus on Escape", async () => {
    setupHandlers({ products: [makeSuggestion()] });
    const user = userEvent.setup();
    renderWithProviders(<HeaderSearch />);

    const trigger = screen.getByRole("button", { name: dict.search.openPanel });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    // The panel owns a second combobox — the shared SearchAutocomplete — and
    // takes focus, so the magnifier behaves like the input it stands in for.
    expect(
      screen.getAllByRole("combobox", { name: dict.search.inputAria }),
    ).toHaveLength(2);
    const panelInput = document.getElementById("compact-search");
    expect(panelInput).toHaveFocus();

    // aria-controls resolves to the element that actually holds that input.
    const panel = document.getElementById(
      trigger.getAttribute("aria-controls") ?? "",
    );
    expect(panel).toContainElement(panelInput);

    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("compact-search")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes the catalog panel when the magnifier opens the search panel", async () => {
    setupHandlers({ categories: makeTree() });
    const user = userEvent.setup();
    renderWithProviders(<HeaderSearch />);

    await user.click(
      screen.getByRole("button", { name: dict.header.catalogAria }),
    );
    await screen.findByRole("menuitem", { name: "Смартфони" });

    await user.click(
      screen.getByRole("button", { name: dict.search.openPanel }),
    );

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.getElementById("compact-search")).toBeInTheDocument();
  });

  it("closes the search panel when the catalog trigger opens the mega-menu", async () => {
    setupHandlers({ categories: makeTree() });
    const user = userEvent.setup();
    renderWithProviders(<HeaderSearch />);

    const magnifier = screen.getByRole("button", {
      name: dict.search.openPanel,
    });
    await user.click(magnifier);
    expect(document.getElementById("compact-search")).toHaveFocus();

    const catalogTrigger = screen.getByRole("button", {
      name: dict.header.catalogAria,
    });
    await user.click(catalogTrigger);
    await screen.findByRole("menuitem", { name: "Смартфони" });

    // The other direction of the same exclusivity: the search panel must go,
    // or two absolutely positioned panels overlap with a focused input buried
    // under the catalog, and both triggers claim aria-expanded="true".
    expect(document.getElementById("compact-search")).not.toBeInTheDocument();
    expect(magnifier).toHaveAttribute("aria-expanded", "false");
    expect(catalogTrigger).toHaveAttribute("aria-expanded", "true");
  });
});

describe("HeaderSearch — mega-menu keyboard, scroll-lock and the second exit (TASK-413)", () => {
  /** Render and open the "Каталог" panel; hands back RTL's unmount too. */
  async function openCatalog() {
    const user = userEvent.setup();
    const view = renderWithProviders(<HeaderSearch />);
    await user.click(
      screen.getByRole("button", { name: dict.header.catalogAria }),
    );
    return { user, unmount: view.unmount };
  }

  function subPane() {
    return screen.getByRole("group", {
      name: dict.header.catalogSubcategoriesAria,
    });
  }

  /** Open the panel and put focus on the first root, ready for an arrow key. */
  async function openOnFirstRoot() {
    const opened = await openCatalog();
    const first = await screen.findByRole("menuitem", { name: "Смартфони" });
    act(() => first.focus());
    return { ...opened, first };
  }

  describe("vertical traversal", () => {
    it("walks the root list downwards and wraps past the last root", async () => {
      setupHandlers({ categories: makeTree() });
      const { user } = await openOnFirstRoot();

      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("menuitem", { name: "Аудіо" })).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("menuitem", { name: "Кабелі" })).toHaveFocus();

      // Wrapping is what keeps ↓ from being a dead key on the last row.
      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("menuitem", { name: "Смартфони" })).toHaveFocus();
    });

    it("walks the root list upwards and wraps past the first root", async () => {
      setupHandlers({ categories: makeTree() });
      const { user } = await openOnFirstRoot();

      await user.keyboard("{ArrowUp}");
      expect(screen.getByRole("menuitem", { name: "Кабелі" })).toHaveFocus();
      await user.keyboard("{ArrowUp}");
      expect(screen.getByRole("menuitem", { name: "Аудіо" })).toHaveFocus();
    });

    it("jumps to the last and first root with End and Home", async () => {
      setupHandlers({ categories: makeTree() });
      const { user } = await openOnFirstRoot();

      await user.keyboard("{End}");
      expect(screen.getByRole("menuitem", { name: "Кабелі" })).toHaveFocus();
      await user.keyboard("{Home}");
      expect(screen.getByRole("menuitem", { name: "Смартфони" })).toHaveFocus();
    });

    it("previews the children of whichever root an arrow key lands on", async () => {
      setupHandlers({ categories: makeTree() });
      const { user } = await openOnFirstRoot();

      await user.keyboard("{ArrowDown}");

      // Arrows drive the right pane exactly as hovering does — otherwise the
      // keyboard reads a pane that belongs to a different root.
      expect(
        within(subPane()).getByRole("menuitem", { name: "Навушники" }),
      ).toBeInTheDocument();
    });

    it("walks the subcategory pane with ArrowDown/ArrowUp/Home/End", async () => {
      setupHandlers({ categories: makeTree() });
      const { user } = await openOnFirstRoot();

      await user.keyboard("{ArrowRight}");
      const cases = within(subPane()).getByRole("menuitem", { name: "Чохли" });
      const glass = within(subPane()).getByRole("menuitem", { name: "Скло" });
      expect(cases).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(glass).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(cases).toHaveFocus();
      await user.keyboard("{End}");
      expect(glass).toHaveFocus();
      await user.keyboard("{Home}");
      expect(cases).toHaveFocus();
      await user.keyboard("{ArrowUp}");
      expect(glass).toHaveFocus();
    });

    it("leaves ArrowLeft and Escape doing what they always did", async () => {
      setupHandlers({ categories: makeTree() });
      const { user, first } = await openOnFirstRoot();

      await user.keyboard("{ArrowRight}{ArrowLeft}");
      expect(first).toHaveFocus();

      await user.keyboard("{Escape}");
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: dict.header.catalogAria }),
      ).toHaveFocus();
    });
  });

  describe("roving tab stops", () => {
    it("gives each pane exactly one tabbable row", async () => {
      setupHandlers({ categories: makeTree() });
      await openCatalog();
      await screen.findByRole("menuitem", { name: "Смартфони" });

      // Root pane: the active root holds the stop.
      expect(
        screen.getByRole("menuitem", { name: "Смартфони" }),
      ).toHaveAttribute("tabindex", "0");
      expect(screen.getByRole("menuitem", { name: "Аудіо" })).toHaveAttribute(
        "tabindex",
        "-1",
      );
      expect(screen.getByRole("menuitem", { name: "Кабелі" })).toHaveAttribute(
        "tabindex",
        "-1",
      );

      // Child pane: its own stop, defaulting to the first row.
      const pane = subPane();
      expect(
        within(pane).getByRole("menuitem", { name: "Чохли" }),
      ).toHaveAttribute("tabindex", "0");
      expect(
        within(pane).getByRole("menuitem", { name: "Скло" }),
      ).toHaveAttribute("tabindex", "-1");
    });

    it("moves the root pane's tab stop with the selection", async () => {
      setupHandlers({ categories: makeTree() });
      const { user } = await openOnFirstRoot();

      await user.keyboard("{ArrowDown}");

      expect(screen.getByRole("menuitem", { name: "Аудіо" })).toHaveAttribute(
        "tabindex",
        "0",
      );
      expect(
        screen.getByRole("menuitem", { name: "Смартфони" }),
      ).toHaveAttribute("tabindex", "-1");
    });

    it("moves the child pane's tab stop, and resets it for a new root", async () => {
      setupHandlers({ categories: makeTree() });
      const { user } = await openOnFirstRoot();

      await user.keyboard("{ArrowRight}{ArrowDown}");
      expect(
        within(subPane()).getByRole("menuitem", { name: "Скло" }),
      ).toHaveAttribute("tabindex", "0");
      expect(
        within(subPane()).getByRole("menuitem", { name: "Чохли" }),
      ).toHaveAttribute("tabindex", "-1");

      // A different root renders a different list; the remembered id matches
      // nothing there, so the stop falls back to that list's first row.
      await user.hover(screen.getByRole("menuitem", { name: "Аудіо" }));
      expect(
        within(subPane()).getByRole("menuitem", { name: "Навушники" }),
      ).toHaveAttribute("tabindex", "0");
    });
  });

  describe("the panel footer", () => {
    it("offers the flat catalogue beside the category index", async () => {
      setupHandlers({ categories: makeTree() });
      await openCatalog();
      await screen.findByRole("menuitem", { name: "Смартфони" });

      expect(
        screen.getByRole("menuitem", { name: dict.header.catalogAll }),
      ).toHaveAttribute("href", "/categories");
      expect(
        screen.getByRole("menuitem", { name: dict.header.catalogAllProducts }),
      ).toHaveAttribute("href", "/products");
    });

    it("closes the panel when the flat catalogue is picked", async () => {
      setupHandlers({ categories: makeTree() });
      const { user } = await openCatalog();
      await screen.findByRole("menuitem", { name: "Смартфони" });

      await user.click(
        screen.getByRole("menuitem", { name: dict.header.catalogAllProducts }),
      );

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  describe("scroll-lock", () => {
    // Belt and braces: a test that fails mid-way must not leave the next one
    // asserting against a locked <body>.
    afterEach(() => {
      document.body.removeAttribute("data-scroll-locked");
      document.body.style.overflow = "";
    });

    /** The two marks the lock leaves on <body>, asserted as one. */
    function expectLocked(locked: boolean) {
      expect(document.body.hasAttribute("data-scroll-locked")).toBe(locked);
      expect(document.body.style.overflow).toBe(locked ? "hidden" : "");
    }

    it("locks the page while the panel is open", async () => {
      setupHandlers({ categories: makeTree() });
      expectLocked(false);
      await openCatalog();
      await screen.findByRole("menuitem", { name: "Смартфони" });

      // The attribute name is not free: globals.css keys `scrollbar-gutter`
      // off `body[data-scroll-locked]`, so any other name would drop the
      // gutter without compensating and slide the page sideways on open.
      expectLocked(true);
    });

    it("releases the lock when Escape closes the panel", async () => {
      setupHandlers({ categories: makeTree() });
      const { user } = await openCatalog();
      await screen.findByRole("menuitem", { name: "Смартфони" });

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expectLocked(false);
    });

    it("releases the lock when a click outside closes the panel", async () => {
      setupHandlers({ categories: makeTree() });
      const { user } = await openCatalog();
      await screen.findByRole("menuitem", { name: "Смартфони" });

      await user.click(document.body);

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expectLocked(false);
    });

    it("releases the lock when a category link closes the panel", async () => {
      setupHandlers({ categories: makeTree() });
      const { user } = await openCatalog();

      await user.click(
        await screen.findByRole("menuitem", { name: "Смартфони" }),
      );

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expectLocked(false);
    });

    it("releases the lock when the header unmounts with the panel open", async () => {
      setupHandlers({ categories: makeTree() });
      const { unmount } = await openCatalog();
      await screen.findByRole("menuitem", { name: "Смартфони" });
      expectLocked(true);

      // A route change can tear the header down mid-panel; a lock that only
      // unwound on the close paths would leave the next page unscrollable.
      unmount();

      expectLocked(false);
    });

    it("leaves a lock somebody else already holds alone", async () => {
      setupHandlers({ categories: makeTree() });
      // Stand in for a Radix overlay that already owns the page.
      document.body.setAttribute("data-scroll-locked", "");
      const { user } = await openCatalog();
      await screen.findByRole("menuitem", { name: "Смартфони" });

      await user.keyboard("{Escape}");

      // Closing our panel must not unlock a page we never locked.
      expect(document.body.hasAttribute("data-scroll-locked")).toBe(true);
    });
  });
});
