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
import type { BlogPostEntity } from "@/entities/blog";
import type { SearchSuggestionEntity } from "@/entities/search";
import { SearchAutocomplete } from "./search-autocomplete";

// next/navigation is unavailable under jsdom — mock the router.
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

function suggestion(
  overrides: Partial<SearchSuggestionEntity> = {},
): SearchSuggestionEntity {
  return {
    id: "product-1",
    name: "iPhone 15 Case",
    slug: "iphone-15-case",
    price: "29.99",
    compareAtPrice: null,
    primaryImageUrl: null,
    ...overrides,
  };
}

function blogPost(overrides: Partial<BlogPostEntity> = {}): BlogPostEntity {
  return {
    id: "post-1",
    slug: "how-to-pick-a-case",
    title: "Як обрати чохол для iPhone",
    excerpt: "Гайд із вибору чохла.",
    content: "",
    coverImageUrl: null,
    coverBlurDataUrl: null,
    authorName: "Олег Пилипенко",
    author: null,
    readingMinutes: 6,
    featured: false,
    listed: true,
    category: { id: "cat-1", slug: "guides", name: "Гайди" },
    status: "PUBLISHED",
    publishedAt: "2026-06-28T09:00:00.000Z",
    scheduledAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Register the two endpoints the autocomplete hits, for any query. */
function mockSuggest(
  rows: SearchSuggestionEntity[],
  posts: BlogPostEntity[] = [],
) {
  server.use(
    http.get("*/api/search/suggest", () => HttpResponse.json({ data: rows })),
    http.get("*/api/blog", () =>
      HttpResponse.json({
        data: posts,
        meta: { total: posts.length, page: 1, limit: 5, totalPages: 1 },
      }),
    ),
  );
}

/** Render and type into the field (the 250ms debounce runs inside). */
async function typeQuery(
  text: string,
  props: Partial<React.ComponentProps<typeof SearchAutocomplete>> = {},
) {
  const user = userEvent.setup();
  renderWithProviders(<SearchAutocomplete {...props} />);
  const input = screen.getByRole("combobox", { name: dict.search.inputAria });
  await user.type(input, text);
  return { user, input };
}

function productList() {
  return screen.getByRole("listbox", { name: dict.search.inputAria });
}

describe("SearchAutocomplete", () => {
  beforeEach(() => mockPush.mockClear());

  it("renders an accessible search combobox", () => {
    renderWithProviders(<SearchAutocomplete />);
    expect(
      screen.getByRole("combobox", { name: dict.search.inputAria }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.search.submitAria }),
    ).toBeInTheDocument();
  });

  it("fetches and shows suggestions as the user types", async () => {
    mockSuggest([
      suggestion(),
      suggestion({
        id: "p2",
        name: "Screen Protector",
        slug: "screen-protector",
      }),
    ]);

    await typeQuery("айф");

    expect(await screen.findByText("iPhone 15 Case")).toBeInTheDocument();
    expect(screen.getByText("Screen Protector")).toBeInTheDocument();
  });

  it("navigates to the product PDP when a suggestion is picked", async () => {
    mockSuggest([suggestion()]);
    const onNavigate = jest.fn();

    const { user } = await typeQuery("айф", { onNavigate });
    await user.click(await screen.findByText("iPhone 15 Case"));

    expect(mockPush).toHaveBeenCalledWith("/products/iphone-15-case");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("selects the highlighted suggestion with ArrowDown + Enter (keyboard)", async () => {
    mockSuggest([suggestion()]);

    const { user } = await typeQuery("айф");
    await screen.findByText("iPhone 15 Case");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(mockPush).toHaveBeenCalledWith("/products/iphone-15-case");
  });

  it("submits to /search on Enter when nothing is highlighted", async () => {
    mockSuggest([suggestion()]);
    const onNavigate = jest.fn();

    const { user } = await typeQuery("чохол", { onNavigate });
    await screen.findByText("iPhone 15 Case");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        `/search?q=${encodeURIComponent("чохол")}`,
      ),
    );
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("does not navigate on submit when the query is blank", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchAutocomplete />);

    await user.click(
      screen.getByRole("button", { name: dict.search.submitAria }),
    );

    expect(mockPush).not.toHaveBeenCalled();
  });

  // TASK-411: the header's compact magnifier drops this component into a panel
  // that only exists once it is opened, so it has to arrive ready to type in.
  it("takes focus on mount when autoFocus is set", () => {
    renderWithProviders(<SearchAutocomplete id="compact-search" autoFocus />);

    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("never steals focus by default (the always-mounted instances)", () => {
    renderWithProviders(<SearchAutocomplete />);

    expect(screen.getByRole("combobox")).not.toHaveFocus();
  });
});

// TASK-805: the compact panel and the mobile menu run the same autocomplete as
// the desktop pill. Each TASK-411 behaviour is pinned here once more, on the
// stand-alone field, so none of them can quietly go missing below `lg`.
describe("SearchAutocomplete — the pill's behaviour at every width (TASK-805/507/509)", () => {
  beforeEach(() => mockPush.mockClear());

  it("mixes blog articles into a second labelled listbox", async () => {
    mockSuggest(
      [suggestion()],
      [
        blogPost(),
        blogPost({ id: "post-2", slug: "magsafe", title: "MagSafe" }),
      ],
    );

    await typeQuery("чохол");

    const blogList = await screen.findByRole("listbox", {
      name: dict.search.blogSectionLabel,
    });
    expect(within(blogList).getAllByRole("option")).toHaveLength(2);
    expect(screen.getByText(dict.search.blogSectionLabel)).toBeInTheDocument();
    expect(within(productList()).getAllByRole("option")).toHaveLength(1);
  });

  it("caps the blog section at 5 articles", async () => {
    mockSuggest(
      [],
      Array.from({ length: 6 }, (_, i) =>
        blogPost({ id: `post-${i}`, slug: `post-${i}`, title: `Стаття ${i}` }),
      ),
    );

    await typeQuery("стаття");

    const blogList = await screen.findByRole("listbox", {
      name: dict.search.blogSectionLabel,
    });
    expect(within(blogList).getAllByRole("option")).toHaveLength(5);
  });

  it("opens a highlighted article on Enter and reports the navigation", async () => {
    mockSuggest([suggestion()], [blogPost()]);
    const onNavigate = jest.fn();

    const { user } = await typeQuery("чохол", { onNavigate });
    await screen.findByRole("listbox", { name: dict.search.blogSectionLabel });

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(mockPush).toHaveBeenCalledWith("/blog/how-to-pick-a-case");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("turns an empty popup into a link to the full results page (TASK-507)", async () => {
    mockSuggest([], []);
    const onNavigate = jest.fn();

    const { user } = await typeQuery("невідомо", { onNavigate });

    const link = await screen.findByRole("link", {
      name: dict.search.showAllResults("невідомо"),
    });
    expect(link).toHaveAttribute(
      "href",
      `/search?q=${encodeURIComponent("невідомо")}`,
    );
    // A way OUT of the popup, not one of its rows.
    expect(within(productList()).queryAllByRole("option")).toHaveLength(0);
    expect(within(productList()).queryByRole("link")).not.toBeInTheDocument();

    // Following it closes the mobile menu too. (jsdom cannot navigate — stop
    // the anchor's default so it does not log "Not implemented: navigation".)
    link.addEventListener("click", (event) => event.preventDefault());
    await user.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("does not claim 'nothing found' when only articles match", async () => {
    mockSuggest([], [blogPost()]);

    await typeQuery("чохол");

    await screen.findByRole("listbox", { name: dict.search.blogSectionLabel });
    expect(screen.queryByText(dict.search.empty)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: dict.search.showAllResults("чохол") }),
    ).not.toBeInTheDocument();
  });

  it("keeps the loading row, not 'nothing found', inside the debounce window (TASK-509)", async () => {
    server.use(
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

    // The request for «ч» has not been sent yet (250ms debounce): nothing is in
    // flight and nothing has arrived, so there is no verdict to announce.
    expect(screen.getByText(dict.search.loading)).toBeInTheDocument();
    expect(screen.queryByText(dict.search.empty)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: dict.search.showAllResults("ч") }),
    ).not.toBeInTheDocument();
  });

  it("keeps the previous suggestions on screen while the next query is in flight", async () => {
    let nextRequested = false;
    server.use(
      http.get("*/api/search/suggest", async ({ request }) => {
        const q = new URL(request.url).searchParams.get("q");
        if (q === "ч") return HttpResponse.json({ data: [suggestion()] });
        nextRequested = true;
        await delay("infinite");
        return HttpResponse.json({ data: [] });
      }),
      http.get("*/api/blog", async ({ request }) => {
        const q = new URL(request.url).searchParams.get("q");
        if (q === "ч")
          return HttpResponse.json({ data: [blogPost()], meta: {} });
        await delay("infinite");
        return HttpResponse.json({ data: [], meta: {} });
      }),
    );

    const { user } = await typeQuery("ч");
    await screen.findByText("iPhone 15 Case");
    await screen.findByText("Як обрати чохол для iPhone");

    await user.keyboard("о");
    await waitFor(() => expect(nextRequested).toBe(true));

    expect(screen.getByText("iPhone 15 Case")).toBeInTheDocument();
    expect(screen.getByText("Як обрати чохол для iPhone")).toBeInTheDocument();
    expect(screen.queryByText(dict.search.loading)).not.toBeInTheDocument();
  });

  it("tracks the highlight with aria-activedescendant across both listboxes", async () => {
    mockSuggest([suggestion()], [blogPost()]);

    const { user, input } = await typeQuery("чохол");
    const blogList = await screen.findByRole("listbox", {
      name: dict.search.blogSectionLabel,
    });
    const options = [
      ...within(productList()).getAllByRole("option"),
      ...within(blogList).getAllByRole("option"),
    ];

    // Open, nothing highlighted → absent, not "".
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(input.getAttribute("aria-controls")).toBe(
      `${productList().id} ${blogList.id}`,
    );

    for (const option of options) {
      await user.keyboard("{ArrowDown}");
      expect(input).toHaveAttribute("aria-activedescendant", option.id);
      expect(option).toHaveAttribute("aria-selected", "true");
      expect(input).toHaveFocus();
    }

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("listbox", { name: dict.search.inputAria }),
    ).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });

  // APG combobox (TASK-508): ↑ from the input enters the combined list at the
  // bottom — the last article — just as ↓ enters it at the first product.
  it("moves ArrowUp from the input to the LAST option of the combined list", async () => {
    mockSuggest(
      [suggestion(), suggestion({ id: "p2", name: "Скло", slug: "glass" })],
      [blogPost()],
    );

    const { user, input } = await typeQuery("чохол");
    const blogList = await screen.findByRole("listbox", {
      name: dict.search.blogSectionLabel,
    });
    const [firstProduct, secondProduct] =
      within(productList()).getAllByRole("option");
    const article = within(blogList).getByRole("option");

    await user.keyboard("{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", article.id);
    expect(article).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", secondProduct.id);

    // Clamped at the top, not wrapped.
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", firstProduct.id);

    // Enter commits what ↑ reached.
    await user.keyboard("{Escape}");
    await user.type(input, "и");
    await screen.findByRole("listbox", { name: dict.search.blogSectionLabel });
    await user.keyboard("{ArrowUp}{Enter}");
    expect(mockPush).toHaveBeenCalledWith("/blog/how-to-pick-a-case");
  });

  it("gives two instances distinct option ids", async () => {
    mockSuggest([suggestion()]);
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <SearchAutocomplete id="mobile-search" />
        <SearchAutocomplete id="compact-search" />
      </>,
    );

    const [first, second] = screen.getAllByRole("combobox");
    await user.type(first, "а");
    await screen.findByText("iPhone 15 Case");
    const firstId = screen.getByRole("option").id;
    act(() => first.blur());

    await user.type(second, "а");
    await screen.findByText("iPhone 15 Case");
    expect(screen.getByRole("option").id).not.toBe(firstId);
  });

  it("closes the popup when focus leaves the field", async () => {
    mockSuggest([suggestion()]);

    await typeQuery("айф");
    await screen.findByText("iPhone 15 Case");

    const outside = document.createElement("button");
    document.body.append(outside);
    act(() => outside.focus());

    expect(
      screen.queryByRole("listbox", { name: dict.search.inputAria }),
    ).not.toBeInTheDocument();
    outside.remove();
  });
});
