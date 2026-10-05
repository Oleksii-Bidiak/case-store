/**
 * `AdminDiscountTable` — first tests TASK-357 (covering TASK-355's server sort),
 * moved onto the shared registry in wave 198 (DiscountsProposal ПК1–ПК2, ПК6–ПК7,
 * TASK-1085).
 *
 * The sort assertions are on the REQUEST, not the rendered rows: a sort control
 * that looks right while sending `sortBy=` for a field the DTO's `@IsIn` rejects
 * would render identically and fail with a 400 in production.
 */

import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { PERM } from "@/entities/permission";
import { AdminDiscountTable } from "./admin-discount-table";

const d = dict.discounts;
const r = dict.common.registry;

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/discounts",
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

const WRITER = { permissions: [PERM.discountsWrite] };

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

function makeDiscountRow(
  id: string,
  code: string,
  overrides: Partial<{
    type: "PERCENT" | "FIXED";
    value: string;
    minSpend: string | null;
    perUserLimit: number | null;
    redeemedCount: number;
    maxRedemptions: number | null;
    startsAt: string | null;
    expiresAt: string | null;
    isActive: boolean;
    showOnPromoPage: boolean;
  }> = {},
) {
  return {
    id,
    code,
    type: overrides.type ?? "PERCENT",
    value: overrides.value ?? "10",
    minSpend: overrides.minSpend ?? null,
    maxRedemptions:
      overrides.maxRedemptions === undefined ? null : overrides.maxRedemptions,
    perUserLimit: overrides.perUserLimit ?? null,
    redeemedCount: overrides.redeemedCount ?? 0,
    startsAt: overrides.startsAt ?? null,
    expiresAt: overrides.expiresAt ?? null,
    isActive: overrides.isActive ?? true,
    showOnPromoPage: overrides.showOnPromoPage ?? false,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

type Row = ReturnType<typeof makeDiscountRow>;

/**
 * Answers like `GET /api/admin/discounts`: filtered by `isActive` when asked,
 * `meta.total` the count for that filter — which the view counters read through
 * one-row requests. Records every request so a test can assert what was asked.
 */
function stubDiscounts(
  rows: Row[],
  meta?: { total: number; page: number; limit: number; totalPages: number },
) {
  const requests: URL[] = [];
  server.use(
    http.get("*/api/admin/discounts", ({ request }) => {
      const url = new URL(request.url);
      requests.push(url);
      const isActive = url.searchParams.get("isActive");
      const matching =
        isActive === null
          ? rows
          : rows.filter((row) => String(row.isActive) === isActive);
      return HttpResponse.json({
        data:
          url.searchParams.get("limit") === "1"
            ? matching.slice(0, 1)
            : matching,
        meta: meta ?? {
          total: matching.length,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      });
    }),
  );
  return requests;
}

/** The page request — not one of the one-row view counters. */
const listRequests = (requests: URL[]) =>
  requests.filter((url) => url.searchParams.get("limit") !== "1");

const PAST_END = "2020-09-26T20:59:59.999Z";
const FUTURE_START = "2099-10-14T21:00:00.000Z";

describe("AdminDiscountTable — rows (ПК1)", () => {
  it("prints the discount with its sign, the conditions in words and the usage against the cap", async () => {
    stubDiscounts([
      makeDiscountRow("d1", "SUMMER10", {
        redeemedCount: 3,
        maxRedemptions: 50,
        perUserLimit: 1,
      }),
      makeDiscountRow("d2", "FIXED50", {
        type: "FIXED",
        value: "50.00",
        minSpend: "3000.00",
      }),
    ]);

    renderWithProviders(<AdminDiscountTable />);

    expect(await screen.findByText("SUMMER10")).toBeInTheDocument();
    expect(screen.getByText("−10%")).toBeInTheDocument();
    // TASK-801: through the one money formatter, like every other sum.
    expect(screen.getByText(/^−50\s₴$/)).toBeInTheDocument();
    expect(screen.getByText(d.redeemedOf(3, 50))).toBeInTheDocument();
    expect(screen.getByText(d.condPerUser(1))).toBeInTheDocument();
    expect(screen.getByText(/^від 3\s000\s₴$/)).toBeInTheDocument();
  });

  it("badges the state WITH the date — an expired code no longer looks active", async () => {
    stubDiscounts([
      makeDiscountRow("d1", "WELCOME10"),
      makeDiscountRow("d2", "EXPIRED15", { expiresAt: PAST_END }),
      makeDiscountRow("d3", "AUTUMN15", { startsAt: FUTURE_START }),
      makeDiscountRow("d4", "OLDPROMO", { isActive: false }),
    ]);

    renderWithProviders(<AdminDiscountTable />);

    await screen.findByText("WELCOME10");
    expect(screen.getByText(d.statusLive)).toBeInTheDocument();
    expect(screen.getByText(d.statusExpired("26.09"))).toBeInTheDocument();
    expect(screen.getByText(d.statusScheduled("15.10"))).toBeInTheDocument();
    expect(screen.getByText(d.statusDisabled)).toBeInTheDocument();
    // The asymmetric pair is gone from the cell.
    expect(
      screen.queryByRole("button", { name: "Деактивувати" }),
    ).not.toBeInTheDocument();
  });

  it("marks a code published on «Акції» and states the window", async () => {
    stubDiscounts([
      makeDiscountRow("d1", "WELCOME10", { showOnPromoPage: true }),
      makeDiscountRow("d2", "EXPIRED15", { expiresAt: PAST_END }),
    ]);

    renderWithProviders(<AdminDiscountTable />);

    await screen.findByText("WELCOME10");
    expect(screen.getAllByText(d.onPromoPage)).toHaveLength(1);
    expect(screen.getByText(d.periodNone)).toBeInTheDocument();
    expect(screen.getByText(d.periodUntil("26.09.2020"))).toBeInTheDocument();
  });

  it("copies the code from the button beside it", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    stubDiscounts([makeDiscountRow("d1", "WELCOME10")]);

    renderWithProviders(<AdminDiscountTable />);

    await userEvent.click(
      await screen.findByRole("button", { name: d.copyCodeAria("WELCOME10") }),
    );
    expect(writeText).toHaveBeenCalledWith("WELCOME10");
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(d.codeCopied("WELCOME10")),
    );
  });

  it("shows the search-specific empty state when a search matched nothing", async () => {
    mockSearchParams = new URLSearchParams("search=nope");
    stubDiscounts([]);

    renderWithProviders(<AdminDiscountTable />);

    expect(await screen.findByText(r.noResults("nope"))).toBeInTheDocument();
  });

  it("says there are no codes yet on an empty, unfiltered list", async () => {
    stubDiscounts([]);

    renderWithProviders(<AdminDiscountTable />);

    expect(await screen.findByText(d.empty)).toBeInTheDocument();
  });

  it("shows the load error with a retry", async () => {
    server.use(
      http.get("*/api/admin/discounts", () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );

    renderWithProviders(<AdminDiscountTable />);

    expect(await screen.findByText(d.loadError)).toBeInTheDocument();
  });
});

describe("AdminDiscountTable — «⋯» (ПК1, ПК6)", () => {
  async function openMenu(code: string) {
    await userEvent.click(
      await screen.findByRole("button", { name: r.rowActionsAria(code) }),
    );
  }

  it("offers edit, copy, duplicate and «Вимкнути…» for a live code", async () => {
    stubDiscounts([makeDiscountRow("d1", "SUMMER500")]);
    renderWithProviders(<AdminDiscountTable />, { auth: WRITER });

    await openMenu("SUMMER500");

    expect(
      await screen.findByRole("menuitem", { name: d.rowEdit }),
    ).toHaveAttribute("href", "/discounts/d1/edit");
    expect(
      screen.getByRole("menuitem", { name: d.rowCopyCode }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: d.rowDuplicate }),
    ).toHaveAttribute("href", "/discounts/new?from=d1");
    expect(
      screen.getByRole("menuitem", { name: d.rowDisable }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: d.rowEnable }),
    ).not.toBeInTheDocument();
  });

  it("«Вимкнути…» asks first, then soft-deactivates — the same DELETE the old button sent", async () => {
    const deletes: string[] = [];
    stubDiscounts([makeDiscountRow("d1", "SUMMER500")]);
    server.use(
      http.delete("*/api/admin/discounts/d1", () => {
        deletes.push("d1");
        return HttpResponse.json({ data: { id: "d1", isActive: false } });
      }),
    );
    renderWithProviders(<AdminDiscountTable />, { auth: WRITER });

    await openMenu("SUMMER500");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.rowDisable }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(d.disableTitle("SUMMER500"));
    expect(deletes).toHaveLength(0);

    await userEvent.click(
      within(dialog).getByRole("button", { name: d.disableConfirm }),
    );
    await waitFor(() => expect(deletes).toEqual(["d1"]));
  });

  it("offers «Увімкнути» for a switched-off code — re-activation no longer needs the form", async () => {
    stubDiscounts([makeDiscountRow("d1", "OLDPROMO", { isActive: false })]);
    renderWithProviders(<AdminDiscountTable />, { auth: WRITER });

    await openMenu("OLDPROMO");

    expect(
      await screen.findByRole("menuitem", { name: d.rowEnable }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: d.rowDisable }),
    ).not.toBeInTheDocument();
  });

  it("view-only (ПК7): no «⋯», a standing notice, the code still opens", async () => {
    stubDiscounts([makeDiscountRow("d1", "SUMMER500")]);
    renderWithProviders(<AdminDiscountTable />);

    await screen.findByText("SUMMER500");
    expect(screen.getByText(d.readOnlyNotice)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: r.rowActionsAria("SUMMER500") }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /SUMMER500/ })).toHaveAttribute(
      "href",
      "/discounts/d1/edit",
    );
  });
});

describe("AdminDiscountTable — quick views «Усі · Вимкнені»", () => {
  it("counts each view from the API", async () => {
    stubDiscounts([
      makeDiscountRow("d1", "A"),
      makeDiscountRow("d2", "B"),
      makeDiscountRow("d3", "C", { isActive: false }),
    ]);
    renderWithProviders(<AdminDiscountTable />);

    const tabs = await screen.findByRole("tablist");
    const [all, disabled] = within(tabs).getAllByRole("tab");
    await waitFor(() => expect(all).toHaveTextContent(`${d.viewAll}3`));
    expect(disabled).toHaveTextContent(`${d.viewDisabled}1`);
  });

  it("writes isActive=false for «Вимкнені» and sends it to the API", async () => {
    stubDiscounts([makeDiscountRow("d1", "A")]);
    renderWithProviders(<AdminDiscountTable />);
    await screen.findByText("A");

    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(`^${d.viewDisabled}`) }),
    );
    expect(mockReplace).toHaveBeenLastCalledWith("/discounts?isActive=false");
  });

  it("forwards the URL's isActive to the list request", async () => {
    mockSearchParams = new URLSearchParams("isActive=false");
    const requests = stubDiscounts([
      makeDiscountRow("d1", "OFF", { isActive: false }),
    ]);
    renderWithProviders(<AdminDiscountTable />);
    await screen.findByText("OFF");

    expect(listRequests(requests)[0].searchParams.get("isActive")).toBe(
      "false",
    );
  });
});

describe("AdminDiscountTable — server sorting (TASK-355)", () => {
  it("defaults to createdAt desc — and names it in the summary", async () => {
    const requests = stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

    renderWithProviders(<AdminDiscountTable />);
    await screen.findByText("SUMMER10");

    const first = listRequests(requests)[0];
    expect(first.searchParams.get("sortBy")).toBe("createdAt");
    expect(first.searchParams.get("sortOrder")).toBe("desc");
    expect(
      screen.getByText(new RegExp(r.summarySort(d.sortCreatedDesc))),
    ).toBeInTheDocument();
  });

  it("sends the URL's sort straight through to the server", async () => {
    mockSearchParams = new URLSearchParams("sortBy=code&sortOrder=asc");
    const requests = stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

    renderWithProviders(<AdminDiscountTable />);
    await screen.findByText("SUMMER10");

    const first = listRequests(requests)[0];
    expect(first.searchParams.get("sortBy")).toBe("code");
    expect(first.searchParams.get("sortOrder")).toBe("asc");
  });

  it("writes a new sort field to the URL, descending first", async () => {
    stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

    renderWithProviders(<AdminDiscountTable />);
    await screen.findByText("SUMMER10");

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.common.sortByAria(d.colCode),
      }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      "/discounts?sortBy=code&sortOrder=desc",
    );
  });

  it("drops the current page when the sort changes", async () => {
    mockSearchParams = new URLSearchParams("page=4");
    stubDiscounts([makeDiscountRow("d1", "SUMMER10")], {
      total: 140,
      page: 4,
      limit: 20,
      totalPages: 7,
    });

    renderWithProviders(<AdminDiscountTable />);
    await screen.findByText("SUMMER10");

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.common.sortByAria(d.colPeriod),
      }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      "/discounts?sortBy=expiresAt&sortOrder=desc",
    );
  });

  // Only the keys `DiscountListQueryDto`'s `@IsIn` accepts may reach the wire.
  it("offers no sortable column the backend DTO would reject", async () => {
    stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

    renderWithProviders(<AdminDiscountTable />);
    await screen.findByText("SUMMER10");

    const sortable = screen
      .getAllByRole("columnheader")
      .filter((header) => header.getAttribute("aria-sort") !== null)
      .map((header) => header.textContent?.trim());

    // «Період» carries its sort hint («за датою «Діє до»») after the label.
    expect(sortable).toEqual([
      d.colCode,
      d.colRedeemed,
      `${d.colPeriod}${d.sortPeriodHint}`,
    ]);
  });
});

describe("AdminDiscountTable — toolbar", () => {
  it("refetches on demand and confirms it in the polite live region", async () => {
    const requests = stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

    renderWithProviders(<AdminDiscountTable />);
    await screen.findByText("SUMMER10");
    const before = listRequests(requests).length;

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() =>
      expect(listRequests(requests).length).toBeGreaterThan(before),
    );
    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        dict.common.table.refreshed,
      ),
    );
  });

  it("writes the typed code to the URL as you type, and drops the page", async () => {
    mockSearchParams = new URLSearchParams("page=3");
    stubDiscounts([makeDiscountRow("d1", "SUMMER10")], {
      total: 140,
      page: 3,
      limit: 20,
      totalPages: 7,
    });

    renderWithProviders(<AdminDiscountTable />);
    await screen.findByText("SUMMER10");

    await userEvent.type(screen.getByLabelText(d.searchAria), "summer");

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/discounts?search=summer"),
    );
  });

  it("forwards the URL search to the server", async () => {
    mockSearchParams = new URLSearchParams("search=summer");
    const requests = stubDiscounts([makeDiscountRow("d1", "SUMMER10")]);

    renderWithProviders(<AdminDiscountTable />);
    await screen.findByText("SUMMER10");

    const first = listRequests(requests)[0];
    expect(first.searchParams.get("search")).toBe("summer");
    expect(first.searchParams.get("limit")).toBe("20");
  });
});

describe("AdminDiscountTable — 390 cards (ПК2)", () => {
  it("shows a card per code with the discount, the terms, the status and «⋯»", async () => {
    setViewport(true);
    stubDiscounts([
      makeDiscountRow("d1", "VIP20", {
        value: "20",
        perUserLimit: 1,
        redeemedCount: 41,
        maxRedemptions: 100,
      }),
    ]);
    renderWithProviders(<AdminDiscountTable />, { auth: WRITER });

    const card = await screen.findByRole("listitem", { name: "VIP20" });
    expect(within(card).getByText("−20%")).toBeInTheDocument();
    expect(
      within(card).getByText(`${d.condPerUser(1)} · ${d.periodNone}`),
    ).toBeInTheDocument();
    expect(within(card).getByText(d.statusLive)).toBeInTheDocument();
    expect(
      within(card).getByText(d.usedCard(d.redeemedOf(41, 100))),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: r.rowActionsAria("VIP20") }),
    ).toBeInTheDocument();
  });
});
