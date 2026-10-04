import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { PERM } from "@/entities/permission";
import { BlogPostTable } from "./blog-post-table";

const d = dict.blogPosts;
const r = dict.common.registry;

// jsdom mounts no app router, and since TASK-357 this table reads page + search
// from the URL and writes them back — so both ends need a stub.
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/blog",
  useSearchParams: () => mockSearchParams,
}));

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

function setViewport(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
const originalMatchMedia = window.matchMedia;

const WRITER = { permissions: [PERM.blogWrite] };

beforeEach(() => {
  mockReplace.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  mockSearchParams = new URLSearchParams("");
  localStorage.clear();
  setViewport(false);
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

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
    coverImageUrl: null as string | null,
    coverBlurDataUrl: null,
    authorName: "Марія Литвин",
    author: null,
    readingMinutes: 5 as number | null,
    featured,
    listed: true,
    category: { id: "cat-1", slug: "guides", name: "Гайди" },
    status,
    publishedAt: status === "PUBLISHED" ? "2026-06-01T09:00:00.000Z" : null,
    // Widened: the TASK-430 scheduled-badge tests override this with a date.
    scheduledAt: null as string | null,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

type PostRow = ReturnType<typeof makePostRow>;

/**
 * Stub the list and hand back the recorded request URLs of the PAGE query —
 * the one-row counter requests (`limit=1`) are answered with their own total
 * and kept apart, so a test can assert WHAT the table asked for.
 */
function stubPosts(
  rows: PostRow[],
  meta?: { total: number; page: number; limit: number; totalPages: number },
  counts: Partial<Record<string, number>> = {},
) {
  const requests: URL[] = [];
  const countRequests: URL[] = [];
  server.use(
    http.get("*/api/admin/blog/posts", ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get("limit") === "1") {
        countRequests.push(url);
        const key = url.searchParams.get("status") ?? "ALL";
        const total = counts[key] ?? 0;
        return HttpResponse.json({
          data: [],
          meta: { total, page: 1, limit: 1, totalPages: total },
        });
      }
      requests.push(url);
      return HttpResponse.json({
        data: rows,
        meta: meta ?? { total: rows.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
    http.get("*/api/admin/blog/categories", () =>
      HttpResponse.json({
        data: [
          {
            id: "cat-1",
            slug: "guides",
            name: "Гайди",
            sortOrder: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "cat-2",
            slug: "news",
            name: "Новини",
            sortOrder: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        meta: { total: 2, page: 1, limit: 2, totalPages: 1 },
      }),
    ),
  );
  return { requests, countRequests };
}

async function openRowMenu(title: string) {
  await userEvent.click(
    await screen.findByRole("button", { name: d.rowActionsAria(title) }),
  );
  return screen.findByRole("menu");
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
    expect(screen.getAllByText("Гайди").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(d.statusPublished)).toBeInTheDocument();
    expect(screen.getByText(d.statusDraft)).toBeInTheDocument();
  });

  it("shows the empty state when there are no posts", async () => {
    stubPosts([]);

    renderWithProviders(<BlogPostTable />);

    await waitFor(() => expect(screen.getByText(d.empty)).toBeInTheDocument());
  });

  it("shows an error message when the request fails", async () => {
    server.use(
      http.get("*/api/admin/blog/posts", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
      http.get("*/api/admin/blog/categories", () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    renderWithProviders(<BlogPostTable />);

    await waitFor(() =>
      expect(screen.getByText(d.loadError)).toBeInTheDocument(),
    );
  });

  /**
   * TASK-430 — «Заплановано» alone left the operator to open the post to find out
   * WHEN, and wore the same grey as a draft.
   */
  describe("scheduled badge (TASK-430)", () => {
    it("shows the scheduled date", async () => {
      stubPosts([
        {
          ...makePostRow("p3", "Friday Post", "SCHEDULED"),
          scheduledAt: "2026-09-19T08:00:00.000Z",
        },
      ]);

      renderWithProviders(<BlogPostTable />);

      expect(
        await screen.findByText(d.statusScheduledOn("19.09.2026")),
      ).toBeInTheDocument();
      expect(screen.queryByText(d.statusDraft)).not.toBeInTheDocument();
    });

    it("falls back to «Заплановано» with no instant, never «Invalid Date»", async () => {
      stubPosts([makePostRow("p4", "No Date", "SCHEDULED")]);

      renderWithProviders(<BlogPostTable />);

      expect(await screen.findByText(d.statusScheduled)).toBeInTheDocument();
    });
  });

  /**
   * Wave 198 (БЛ1): «Головна» and «У списках» stopped being columns — a badge
   * next to the status says it only when it is true.
   */
  describe("row facts (БЛ1)", () => {
    it("puts «★ Головна» and «Не в списках» next to the status, not in columns", async () => {
      stubPosts([
        makePostRow("p1", "Hero", "PUBLISHED", true),
        { ...makePostRow("p2", "Hidden", "PUBLISHED"), listed: false },
      ]);

      renderWithProviders(<BlogPostTable />);

      expect(await screen.findByText(d.featuredBadge)).toBeInTheDocument();
      expect(screen.getByText(d.unlistedBadge)).toBeInTheDocument();
      expect(
        screen.queryByRole("columnheader", { name: "Головна" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("columnheader", { name: "У списках" }),
      ).not.toBeInTheDocument();
    });

    it("shows the author and the reading minutes under the title", async () => {
      stubPosts([makePostRow("p1", "Hero", "PUBLISHED")]);

      renderWithProviders(<BlogPostTable />);

      expect(
        await screen.findByText(`Марія Литвин · ${d.minutes(5)}`),
      ).toBeInTheDocument();
    });

    it("shows the cover thumbnail, or says there is none", async () => {
      stubPosts([
        {
          ...makePostRow("p1", "With cover", "PUBLISHED"),
          coverImageUrl: "http://localhost:3001/uploads/cover.webp",
        },
        makePostRow("p2", "No cover", "DRAFT"),
      ]);

      const { container } = renderWithProviders(<BlogPostTable />);
      await screen.findByText("With cover");

      expect(
        container.querySelector(
          'img[src="http://localhost:3001/uploads/cover.webp"]',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(d.noCover)).toBeInTheDocument();
    });

    it("shows the publish date of a published post", async () => {
      stubPosts([makePostRow("p1", "Hero", "PUBLISHED")]);

      renderWithProviders(<BlogPostTable />);

      expect(await screen.findByText("01.06.2026")).toBeInTheDocument();
    });
  });

  describe("quick views (БЛ1)", () => {
    it("offers «Усі · Опубліковані · Заплановані · Чернетки» with the API's own totals", async () => {
      stubPosts([], undefined, {
        ALL: 12,
        PUBLISHED: 11,
        SCHEDULED: 1,
        DRAFT: 0,
      });

      renderWithProviders(<BlogPostTable />);
      await screen.findByText(d.empty);

      const tabs = within(
        screen.getByRole("tablist", { name: r.quickViewsLabel }),
      ).getAllByRole("tab");
      expect(tabs.map((tab) => tab.textContent)).toEqual([
        "Усі12",
        "Опубліковані11",
        "Заплановані1",
        "Чернетки0",
      ]);
    });

    it("writes ?status= and resets the page", async () => {
      mockSearchParams = new URLSearchParams("page=3");
      stubPosts([]);
      renderWithProviders(<BlogPostTable />);
      await screen.findByText(d.empty);

      await userEvent.click(screen.getByRole("tab", { name: /^Опубліковані/ }));

      expect(mockReplace).toHaveBeenCalledWith("/blog?status=PUBLISHED");
    });

    it("deep-links: ?status=DRAFT filters the API and lights «Чернетки»", async () => {
      mockSearchParams = new URLSearchParams("status=DRAFT");
      const { requests } = stubPosts([makePostRow("p2", "Draft One", "DRAFT")]);

      renderWithProviders(<BlogPostTable />);
      await screen.findByText("Draft One");

      expect(requests[0].searchParams.get("status")).toBe("DRAFT");
      expect(screen.getByRole("tab", { name: /^Чернетки/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });

  describe("category filter (БЛ1, КБ1 «Показати статті»)", () => {
    it("filters by ?category= and names it in a removable chip", async () => {
      mockSearchParams = new URLSearchParams("category=guides");
      const { requests } = stubPosts([makePostRow("p1", "Hero", "PUBLISHED")]);

      renderWithProviders(<BlogPostTable />);
      await screen.findByText("Hero");

      expect(requests[0].searchParams.get("category")).toBe("guides");
      const chip = await screen.findByText(d.chipCategory("Гайди"));
      expect(chip).toBeInTheDocument();
    });

    it("picks a category in «Фільтри»", async () => {
      stubPosts([makePostRow("p1", "Hero", "PUBLISHED")]);
      renderWithProviders(<BlogPostTable />);
      await screen.findByText("Hero");

      await userEvent.click(
        screen.getByRole("button", { name: new RegExp(`^${r.filters}`) }),
      );
      const sheet = await screen.findByRole("dialog");
      await userEvent.click(
        await within(sheet).findByRole("button", { name: "Новини" }),
      );
      await userEvent.click(
        within(sheet).getByRole("button", { name: d.filtersApply }),
      );

      expect(mockReplace).toHaveBeenCalledWith("/blog?category=news");
    });
  });

  describe("row actions «⋯» (БЛ1)", () => {
    it("offers Редагувати · Відкрити на сайті · Зняти з публікації · Видалити… on a published post", async () => {
      stubPosts([makePostRow("p1", "iPhone 16", "PUBLISHED")]);
      renderWithProviders(<BlogPostTable />, { auth: WRITER });

      const menu = await openRowMenu("iPhone 16");
      const items = within(menu).getAllByRole("menuitem");
      expect(items.map((item) => item.textContent)).toEqual([
        d.rowEdit,
        d.rowOpenSite,
        d.unpublish,
        d.rowDelete,
      ]);
      expect(
        within(menu).getByRole("menuitem", { name: d.rowEdit }),
      ).toHaveAttribute("href", "/blog/p1/edit");
      const site = within(menu).getByRole("menuitem", { name: d.rowOpenSite });
      expect(site).toHaveAttribute("href", `${STOREFRONT_URL}/blog/iphone-16`);
      expect(site).toHaveAttribute("target", "_blank");
    });

    it("offers «Опублікувати» and no site link on a draft", async () => {
      stubPosts([makePostRow("p2", "Draft One", "DRAFT")]);
      renderWithProviders(<BlogPostTable />, { auth: WRITER });

      const menu = await openRowMenu("Draft One");
      expect(
        within(menu).getByRole("menuitem", { name: d.publish }),
      ).toBeInTheDocument();
      expect(
        within(menu).queryByRole("menuitem", { name: d.rowOpenSite }),
      ).not.toBeInTheDocument();
    });

    it("publishes through the API and confirms", async () => {
      stubPosts([makePostRow("p2", "Draft One", "DRAFT")]);
      const calls: string[] = [];
      server.use(
        http.patch("*/api/admin/blog/posts/p2/publish", ({ request }) => {
          calls.push(request.url);
          return HttpResponse.json({
            data: makePostRow("p2", "Draft One", "PUBLISHED"),
          });
        }),
      );
      renderWithProviders(<BlogPostTable />, { auth: WRITER });

      const menu = await openRowMenu("Draft One");
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: d.publish }),
      );

      await waitFor(() => expect(calls).toHaveLength(1));
      await waitFor(() =>
        expect(toastSuccess).toHaveBeenCalledWith(d.toastPublished),
      );
    });

    it("without blog:write offers only «Відкрити на сайті» and no add/edit link", async () => {
      stubPosts([makePostRow("p1", "iPhone 16", "PUBLISHED")]);
      renderWithProviders(<BlogPostTable />);

      const menu = await openRowMenu("iPhone 16");
      expect(
        within(menu)
          .getAllByRole("menuitem")
          .map((item) => item.textContent),
      ).toEqual([d.rowOpenSite]);
    });
  });

  // TASK-285 + TASK-812: the delete confirm became an AlertDialog; the Google
  // warning shows only for a currently-published row.
  describe("delete dialog (БЛ6)", () => {
    it("names the post, warns about the index and hints at «Показувати у списках» for a published post", async () => {
      stubPosts([makePostRow("p1", "iPhone 16", "PUBLISHED")]);
      renderWithProviders(<BlogPostTable />, { auth: WRITER });

      const menu = await openRowMenu("iPhone 16");
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: d.rowDelete }),
      );

      const dialog = await screen.findByRole("alertdialog");
      expect(
        within(dialog).getByText(d.deleteTitle("iPhone 16")),
      ).toBeInTheDocument();
      expect(dialog).toHaveTextContent(d.deleteIndexed);
      expect(dialog).toHaveTextContent(d.deleteListedHint);
    });

    it("omits the indexed warning for a draft post", async () => {
      stubPosts([makePostRow("p2", "Draft One", "DRAFT")]);
      renderWithProviders(<BlogPostTable />, { auth: WRITER });

      const menu = await openRowMenu("Draft One");
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: d.rowDelete }),
      );

      const dialog = await screen.findByRole("alertdialog");
      expect(dialog).toHaveTextContent(d.deleteIrreversible);
      expect(dialog).not.toHaveTextContent("пошуковому індексі");
    });

    it("deletes only after the confirm, and cancel sends nothing", async () => {
      stubPosts([makePostRow("p2", "Draft One", "DRAFT")]);
      const deletes: string[] = [];
      server.use(
        http.delete("*/api/admin/blog/posts/p2", ({ request }) => {
          deletes.push(request.url);
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderWithProviders(<BlogPostTable />, { auth: WRITER });

      let menu = await openRowMenu("Draft One");
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: d.rowDelete }),
      );
      await userEvent.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", {
          name: dict.common.cancel,
        }),
      );
      expect(deletes).toHaveLength(0);

      menu = await openRowMenu("Draft One");
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: d.rowDelete }),
      );
      await userEvent.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", {
          name: d.deleteAction,
        }),
      );

      await waitFor(() => expect(deletes).toHaveLength(1));
      await waitFor(() =>
        expect(toastSuccess).toHaveBeenCalledWith(d.toastDeleted),
      );
    });
  });

  describe("cards below md (БЛ3)", () => {
    it("draws a card with the facts line and the status", async () => {
      setViewport(true);
      stubPosts([makePostRow("p1", "iPhone 16", "PUBLISHED")]);

      renderWithProviders(<BlogPostTable />, { auth: WRITER });

      expect(
        await screen.findByText(
          `Гайди · 01.06.2026 · Марія Литвин · ${d.minutes(5)}`,
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(d.statusPublished)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: d.rowActionsAria("iPhone 16") }),
      ).toBeInTheDocument();
    });
  });

  // TASK-357: the table asked for `limit: 100` and rendered no page controls,
  // so post 101 existed on the server and nowhere in the panel.
  describe("no more silent truncation (TASK-357)", () => {
    it("no longer asks for a 100-row slab", async () => {
      const { requests } = stubPosts([
        makePostRow("p1", "iPhone 16", "PUBLISHED"),
      ]);

      renderWithProviders(<BlogPostTable />);
      await screen.findByText("iPhone 16");

      expect(requests[0].searchParams.get("limit")).not.toBe("100");
      expect(requests[0].searchParams.get("limit")).toBe("20");
    });

    it("shows a reachable control past the page boundary instead of nothing", async () => {
      stubPosts([makePostRow("p1", "iPhone 16", "PUBLISHED")], {
        total: 260,
        page: 1,
        limit: 20,
        totalPages: 13,
      });

      renderWithProviders(<BlogPostTable />);
      await screen.findByText("iPhone 16");

      expect(screen.getByText(dict.common.pageOf(1, 13))).toBeInTheDocument();
      const next = screen.getByRole("button", { name: dict.common.next });
      expect(next).toBeEnabled();

      await userEvent.click(next);

      expect(mockReplace).toHaveBeenCalledWith("/blog?page=2");
    });

    it("refetches on demand — the point of the refresh control", async () => {
      const { requests } = stubPosts([
        makePostRow("p1", "iPhone 16", "PUBLISHED"),
      ]);

      renderWithProviders(<BlogPostTable />);
      await screen.findByText("iPhone 16");
      expect(requests).toHaveLength(1);

      await userEvent.click(
        screen.getByRole("button", { name: dict.common.table.refreshAria }),
      );

      await waitFor(() => expect(requests).toHaveLength(2));
    });

    // The URL key is `search` (every admin table uses it) but the wire key is
    // `q` — this endpoint named it that long before the toolbar existed.
    it("sends the URL's ?search= as the API's `q`", async () => {
      mockSearchParams = new URLSearchParams("search=iphone");
      const { requests } = stubPosts([
        makePostRow("p1", "iPhone 16", "PUBLISHED"),
      ]);

      renderWithProviders(<BlogPostTable />);
      await screen.findByText("iPhone 16");

      expect(requests[0].searchParams.get("q")).toBe("iphone");
      expect(requests[0].searchParams.get("search")).toBeNull();
    });
  });
});
