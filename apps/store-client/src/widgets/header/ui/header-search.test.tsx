import { http, HttpResponse, delay } from "msw";
import { act } from "@testing-library/react";
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { BlogPostSuggestionEntity } from "@/entities/blog";
import type { CategoryTreeNodeEntity } from "@/entities/category";
import type { SearchSuggestionEntity } from "@/entities/search";
// Test-only composition: the app layer plugs the mega menu into the slot
// (app/site-header.tsx); the widget itself never imports it.
import { CatalogMegaMenu } from "@/widgets/catalog-menu";
import { HeaderSearch, MEGA_MENU_QUERY } from "./header-search";

// next/navigation is unavailable under jsdom — mock the router used by pick/submit.
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const originalMatchMedia = window.matchMedia;

/** `lg` and up (the mega menu exists) or below it (the sheet takes over). */
function setWide(wide: boolean): void {
  window.matchMedia = (query: string) =>
    ({
      matches: wide && query === MEGA_MENU_QUERY,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

beforeEach(() => {
  mockPush.mockClear();
  setWide(true);
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

/** The pill with the real mega menu in its slot, as the site header has it. */
function renderSearch(onOpenMenu: () => void = jest.fn()) {
  return renderWithProviders(
    <HeaderSearch
      renderCatalogMenu={({ onClose }) => <CatalogMegaMenu onClose={onClose} />}
      onOpenMenu={onOpenMenu}
    />,
  );
}

/** The open catalog panel, or null. */
function catalogPanel() {
  return screen.queryByRole("group", { name: dict.header.catalogAria });
}

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

/**
 * Build a blog-article suggestion (the light `/api/blog/suggest` row, TASK-543)
 * with sensible defaults; override per-test.
 */
function makeBlogPost(
  overrides: Partial<BlogPostSuggestionEntity> = {},
): BlogPostSuggestionEntity {
  return {
    id: "post-1",
    slug: "how-to-pick-a-case",
    title: "Як обрати чохол для iPhone",
    coverImageUrl: null,
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
 * fires on mount — TASK-082), product suggest, and the blog suggest (TASK-218,
 * its own light endpoint since TASK-543).
 */
function setupHandlers({
  products = [],
  posts = [],
  categories = [],
}: {
  products?: SearchSuggestionEntity[];
  posts?: BlogPostSuggestionEntity[];
  categories?: CategoryTreeNodeEntity[];
} = {}) {
  server.use(
    http.get("*/api/categories/tree", () =>
      HttpResponse.json({ data: categories }),
    ),
    http.get("*/api/search/suggest", () =>
      HttpResponse.json({ data: products }),
    ),
    http.get("*/api/blog/suggest", () => HttpResponse.json({ data: posts })),
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

  it("enters the combined list at the bottom on ArrowUp (APG, TASK-508)", async () => {
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

    // ↑ with nothing highlighted → the last option (the article), not the
    // first product it used to clamp to.
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", options[2].id);
    expect(options[2]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id);
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
      http.get("*/api/blog/suggest", async () => {
        await delay("infinite");
        return HttpResponse.json({ data: [] });
      }),
    );

    await typeQuery("ч");

    // The request for "ч" has not even been sent yet (250ms debounce), so
    // nothing is in flight and nothing has arrived — the popup must not
    // announce a verdict it cannot have.
    expect(screen.getByText(dict.search.loading)).toBeInTheDocument();
    expect(screen.queryByText(dict.search.empty)).not.toBeInTheDocument();
  });

  it("keeps the previous suggestions on screen while the next query is in flight", async () => {
    let nextRequested = false;
    server.use(
      http.get("*/api/categories/tree", () => HttpResponse.json({ data: [] })),
      http.get("*/api/search/suggest", async ({ request }) => {
        const q = new URL(request.url).searchParams.get("q");
        if (q === "ч") return HttpResponse.json({ data: [makeSuggestion()] });
        nextRequested = true;
        await delay("infinite");
        return HttpResponse.json({ data: [] });
      }),
      http.get("*/api/blog/suggest", async ({ request }) => {
        const q = new URL(request.url).searchParams.get("q");
        if (q === "ч") {
          return HttpResponse.json({ data: [makeBlogPost()] });
        }
        await delay("infinite");
        return HttpResponse.json({ data: [] });
      }),
    );

    const { user } = await typeQuery("ч");
    await screen.findByText("Чохол iPhone 15 Pro");
    await screen.findByText("Як обрати чохол для iPhone");

    await user.keyboard("о");
    await waitFor(() => expect(nextRequested).toBe(true));

    // keepPreviousData: the rows for «ч» stay put while «чо» is loading — the
    // popup neither empties nor blinks through the loading row between letters.
    expect(screen.getByText("Чохол iPhone 15 Pro")).toBeInTheDocument();
    expect(screen.getByText("Як обрати чохол для iPhone")).toBeInTheDocument();
    expect(screen.queryByText(dict.search.loading)).not.toBeInTheDocument();
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
    renderSearch();

    await user.click(
      screen.getByRole("button", { name: dict.header.catalogAria }),
    );
    await screen.findByRole("link", { name: "Смартфони" });

    await user.click(
      screen.getByRole("button", { name: dict.search.openPanel }),
    );

    expect(catalogPanel()).not.toBeInTheDocument();
    expect(document.getElementById("compact-search")).toBeInTheDocument();
  });

  it("closes the search panel when the catalog trigger opens the mega-menu", async () => {
    setupHandlers({ categories: makeTree() });
    const user = userEvent.setup();
    renderSearch();

    const magnifier = screen.getByRole("button", {
      name: dict.search.openPanel,
    });
    await user.click(magnifier);
    expect(document.getElementById("compact-search")).toHaveFocus();

    const catalogTrigger = screen.getByRole("button", {
      name: dict.header.catalogAria,
    });
    await user.click(catalogTrigger);
    await screen.findByRole("link", { name: "Смартфони" });

    // The other direction of the same exclusivity: the search panel must go,
    // or two absolutely positioned panels overlap with a focused input buried
    // under the catalog, and both triggers claim aria-expanded="true".
    expect(document.getElementById("compact-search")).not.toBeInTheDocument();
    expect(magnifier).toHaveAttribute("aria-expanded", "false");
    expect(catalogTrigger).toHaveAttribute("aria-expanded", "true");
  });
});

// The panel's box and lifecycle (TASK-082, TASK-413, TASK-2072). Its content —
// roots, tiles, keyboard, device column — is CatalogMegaMenu's own suite.
describe("HeaderSearch — the catalog panel", () => {
  /** Render and open the "Каталог" panel; hands back RTL's unmount too. */
  async function openCatalog(onOpenMenu?: () => void) {
    const user = userEvent.setup();
    const view = renderSearch(onOpenMenu);
    await user.click(trigger());
    return { user, unmount: view.unmount };
  }

  function trigger() {
    return screen.getByRole("button", { name: dict.header.catalogAria });
  }

  it("opens a labelled panel the trigger controls, with the slot's content", async () => {
    setupHandlers({ categories: makeTree() });
    await openCatalog();

    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    // Disclosure navigation, not an ARIA menu (TASK-2072).
    expect(trigger()).not.toHaveAttribute("aria-haspopup");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const panel = catalogPanel();
    expect(panel).toHaveAttribute(
      "id",
      trigger().getAttribute("aria-controls"),
    );
    expect(
      await within(panel!).findByRole("link", { name: "Смартфони" }),
    ).toHaveAttribute("href", "/categories/phones");
  });

  it("anchors the panel to the header row, aligned with the logo", async () => {
    setupHandlers({ categories: makeTree() });
    await openCatalog();

    // Positioned by the row (header.tsx), not by the pill: hung off the
    // pill's left edge the ≈1142px panel ran past a 1280 viewport.
    expect(catalogPanel()).toHaveClass("absolute", "top-full", "lg:left-8");
    expect(catalogPanel()?.parentElement).not.toHaveClass("relative");
  });

  it("closes on a second click of the trigger", async () => {
    setupHandlers({ categories: makeTree() });
    const { user } = await openCatalog();

    await user.click(trigger());

    expect(catalogPanel()).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when a category link is picked", async () => {
    setupHandlers({ categories: makeTree() });
    const { user } = await openCatalog();

    await user.click(await screen.findByRole("link", { name: "Скло" }));

    expect(catalogPanel()).not.toBeInTheDocument();
  });

  it("returns focus to the trigger when Escape closes the panel", async () => {
    setupHandlers({ categories: makeTree() });
    const { user } = await openCatalog();
    const root = await screen.findByRole("link", { name: "Смартфони" });
    act(() => root.focus());

    await user.keyboard("{Escape}");

    expect(catalogPanel()).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("closes the panel when focus leaves it altogether", async () => {
    setupHandlers({ categories: makeTree() });
    await openCatalog();
    const root = await screen.findByRole("link", { name: "Смартфони" });
    act(() => root.focus());

    // Somewhere outside the widget — a Tab-out, in effect. Leaving the panel
    // open behind departed focus would strand the visitor under a
    // scroll-locked page.
    const outside = document.createElement("button");
    document.body.append(outside);
    act(() => outside.focus());

    expect(catalogPanel()).not.toBeInTheDocument();
    outside.remove();
  });

  it("below lg opens the menu sheet instead of the panel", async () => {
    setupHandlers({ categories: makeTree() });
    setWide(false);
    const onOpenMenu = jest.fn();
    await openCatalog(onOpenMenu);

    expect(onOpenMenu).toHaveBeenCalledTimes(1);
    expect(catalogPanel()).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(document.body).not.toHaveAttribute("data-scroll-locked");
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
      await screen.findByRole("link", { name: "Смартфони" });

      // The attribute name is not free: globals.css keys `scrollbar-gutter`
      // off `body[data-scroll-locked]`, so any other name would drop the
      // gutter without compensating and slide the page sideways on open.
      expectLocked(true);
    });

    it("releases the lock when Escape closes the panel", async () => {
      setupHandlers({ categories: makeTree() });
      const { user } = await openCatalog();
      await screen.findByRole("link", { name: "Смартфони" });

      await user.keyboard("{Escape}");

      expect(catalogPanel()).not.toBeInTheDocument();
      expectLocked(false);
    });

    it("releases the lock when a click outside closes the panel", async () => {
      setupHandlers({ categories: makeTree() });
      const { user } = await openCatalog();
      await screen.findByRole("link", { name: "Смартфони" });

      await user.click(document.body);

      expect(catalogPanel()).not.toBeInTheDocument();
      expectLocked(false);
    });

    it("releases the lock when a category link closes the panel", async () => {
      setupHandlers({ categories: makeTree() });
      const { user } = await openCatalog();

      await user.click(await screen.findByRole("link", { name: "Смартфони" }));

      expect(catalogPanel()).not.toBeInTheDocument();
      expectLocked(false);
    });

    it("releases the lock when the header unmounts with the panel open", async () => {
      setupHandlers({ categories: makeTree() });
      const { unmount } = await openCatalog();
      await screen.findByRole("link", { name: "Смартфони" });
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
      await screen.findByRole("link", { name: "Смартфони" });

      await user.keyboard("{Escape}");

      // Closing our panel must not unlock a page we never locked.
      expect(document.body.hasAttribute("data-scroll-locked")).toBe(true);
    });
  });
});

// TASK-1996: the pill's popup shares the cap of the stand-alone field — a
// viewport-tied height on the popup root, which is the one scroll area.
describe("HeaderSearch — popup height on a short viewport (TASK-1996)", () => {
  it("caps the pill's popup to the viewport height with a single scroll area", async () => {
    setupHandlers({ products: [makeSuggestion()], posts: [makeBlogPost()] });

    await typeQuery("чохол");
    await screen.findByText("Як обрати чохол для iPhone");
    const productList = screen.getByRole("listbox", {
      name: dict.search.inputAria,
    });
    const popup = productList.parentElement!;

    expect(popup).toHaveClass("absolute", "overflow-y-auto");
    expect(popup.className).toMatch(/max-h-\[[^\]]*100dvh[^\]]*\]/);
    expect(
      popup.querySelectorAll(".overflow-y-auto, [class*='max-h-']"),
    ).toHaveLength(0);
  });
});
