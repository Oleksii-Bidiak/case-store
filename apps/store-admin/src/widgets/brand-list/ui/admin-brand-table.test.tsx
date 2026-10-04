/**
 * `AdminBrandTable` — the brand registry (TASK-357 toolbar, TASK-840 logo +
 * product count, wave 198 BrandsProposal БР1–БР4 / TASK-1078).
 *
 * The cases below keep proving the old abilities are still there after the
 * move onto the shared registry — refresh, search, the status filter (now the
 * quick views), the logo, the count, «Редагувати», the visibility toggle —
 * and add what the artboard asked for.
 */

import { delay, http, HttpResponse } from "msw";
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
import { AdminBrandTable } from "./admin-brand-table";

const d = dict.brands;

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/brands",
  useSearchParams: () => mockSearchParams,
}));

const toastSuccess = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: jest.fn(),
  },
}));

const WRITER = { permissions: [PERM.brandsWrite, PERM.productsRead] };

beforeEach(() => {
  mockReplace.mockClear();
  toastSuccess.mockClear();
  mockSearchParams = new URLSearchParams("");
  localStorage.clear();
});

function makeBrandRow(
  id: string,
  name: string,
  isActive = true,
  extra: { logo?: string | null; productCount?: number } = {},
) {
  return {
    id,
    name,
    slug: name.toLowerCase(),
    logo: extra.logo ?? null,
    productCount: extra.productCount,
    isActive,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

/**
 * Stub the admin list. A one-row request (`limit=1`) is a view counter and
 * answers with `counts` by its `isActive`; every other request is the page.
 */
function stubBrands(
  rows: ReturnType<typeof makeBrandRow>[],
  counts: { all: number; shown: number; hidden: number } = {
    all: rows.length,
    shown: rows.filter((row) => row.isActive).length,
    hidden: rows.filter((row) => !row.isActive).length,
  },
) {
  const requests: URL[] = [];
  server.use(
    http.get("*/api/brands/admin/list", ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get("limit") === "1") {
        const active = url.searchParams.get("isActive");
        const total =
          active === "true"
            ? counts.shown
            : active === "false"
              ? counts.hidden
              : counts.all;
        return HttpResponse.json({
          data: [],
          meta: { total, page: 1, limit: 1, totalPages: total },
        });
      }
      requests.push(url);
      return HttpResponse.json({
        data: rows,
        meta: { total: rows.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
  return requests;
}

async function openRowMenu(name: string) {
  await userEvent.click(
    await screen.findByRole("button", { name: d.rowActionsAria(name) }),
  );
  return screen.findByRole("menu");
}

describe("AdminBrandTable — registry chrome (БР1)", () => {
  it("refetches on demand — the point of the refresh control", async () => {
    const requests = stubBrands([makeBrandRow("b1", "Baseus")]);

    renderWithProviders(<AdminBrandTable />);
    await screen.findByText("Baseus");
    expect(requests).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(requests).toHaveLength(2));
  });

  it("draws the header with its description and the quick views with the API's counts", async () => {
    stubBrands([makeBrandRow("b1", "Baseus")], {
      all: 17,
      shown: 16,
      hidden: 1,
    });

    renderWithProviders(<AdminBrandTable />, { auth: WRITER });

    expect(
      await screen.findByRole("heading", { name: d.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(d.description)).toBeInTheDocument();
    const views = screen.getByRole("tablist", {
      name: dict.common.registry.quickViewsLabel,
    });
    await waitFor(() => {
      expect(within(views).getByRole("tab", { name: /Усі/ })).toHaveTextContent(
        "17",
      );
    });
    expect(
      within(views).getByRole("tab", { name: new RegExp(d.viewShown) }),
    ).toHaveTextContent("16");
    expect(
      within(views).getByRole("tab", { name: new RegExp(d.viewHidden) }),
    ).toHaveTextContent("1");
    // «Без логотипа» needs an API filter — not drawn (TASK-1078 API tail).
    expect(
      within(views).queryByRole("tab", { name: /логотипа/ }),
    ).not.toBeInTheDocument();
  });

  it("the «Приховані» view writes the old `?status=inactive` URL", async () => {
    stubBrands([makeBrandRow("b1", "Baseus")]);
    renderWithProviders(<AdminBrandTable />);
    await screen.findByText("Baseus");

    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(d.viewHidden) }),
    );

    expect(mockReplace).toHaveBeenCalledWith("/brands?status=inactive");
  });

  it("still forwards the URL search and status filter to the server", async () => {
    mockSearchParams = new URLSearchParams("search=baseus&status=inactive");
    const requests = stubBrands([makeBrandRow("b1", "Baseus", false)]);

    renderWithProviders(<AdminBrandTable />);
    await screen.findByText("Baseus");

    expect(requests[0].searchParams.get("search")).toBe("baseus");
    expect(requests[0].searchParams.get("isActive")).toBe("false");
    expect(screen.getByLabelText(d.searchAria)).toBeInTheDocument();
  });

  it("says how many brands were found", async () => {
    stubBrands([makeBrandRow("b1", "Baseus"), makeBrandRow("b2", "Anker")]);
    renderWithProviders(<AdminBrandTable />);
    await screen.findByText("Baseus");

    expect(
      screen.getByText(d.summaryFound, { exact: false }),
    ).toHaveTextContent("2 бренди");
  });

  it("offers «Додати бренд» only to a session that may write brands", async () => {
    stubBrands([makeBrandRow("b1", "Baseus")]);
    const { unmount } = renderWithProviders(<AdminBrandTable />, {
      auth: WRITER,
    });
    expect(await screen.findByRole("link", { name: d.add })).toHaveAttribute(
      "href",
      "/brands/new",
    );
    unmount();

    renderWithProviders(<AdminBrandTable />);
    await screen.findByText("Baseus");
    expect(screen.queryByRole("link", { name: d.add })).not.toBeInTheDocument();
    expect(screen.getByText(d.viewOnlyNotice)).toBeInTheDocument();
  });
});

describe("AdminBrandTable — rows (TASK-840, БР1)", () => {
  it("shows each logo as a thumbnail with alt text, and initials where there is none", async () => {
    stubBrands([
      makeBrandRow("b1", "Spigen", true, {
        logo: "https://cdn.example.com/spigen.svg",
        productCount: 12,
      }),
      makeBrandRow("b2", "Zagg", true, { logo: null, productCount: 3 }),
    ]);

    renderWithProviders(<AdminBrandTable />);
    await screen.findByText("Spigen");

    const logo = screen.getByRole("img", { name: d.logoAlt("Spigen") });
    expect(logo).toHaveAttribute("src", "https://cdn.example.com/spigen.svg");
    const zagg = screen.getByText("Zagg").closest("tr") as HTMLElement;
    expect(within(zagg).getByText("Za")).toBeInTheDocument();
  });

  it("anchors a storefront-relative logo to the storefront, not to the admin origin", async () => {
    stubBrands([
      makeBrandRow("b1", "Spigen", true, {
        logo: "/brands/spigen.svg",
        productCount: 1,
      }),
    ]);

    renderWithProviders(<AdminBrandTable />);
    await screen.findByText("Spigen");

    const src = screen
      .getByRole("img", { name: d.logoAlt("Spigen") })
      .getAttribute("src");
    expect(src).toMatch(/^https?:\/\/[^/]+\/brands\/spigen\.svg$/);
    expect(src).not.toBe("/brands/spigen.svg");
  });

  it("puts the slug under the name", async () => {
    stubBrands([makeBrandRow("b1", "Spigen")]);
    renderWithProviders(<AdminBrandTable />);
    const row = (await screen.findByText("Spigen")).closest(
      "tr",
    ) as HTMLElement;
    expect(within(row).getByText("spigen")).toBeInTheDocument();
  });

  it("shows the live product count, including an honest zero, as a link into «Товари»", async () => {
    stubBrands([
      makeBrandRow("b1", "Spigen", true, { productCount: 12 }),
      makeBrandRow("b2", "Zagg", false, { productCount: 0 }),
    ]);

    renderWithProviders(<AdminBrandTable />, { auth: WRITER });
    await screen.findByText("Spigen");

    expect(
      screen.getByRole("columnheader", { name: new RegExp(d.colProducts) }),
    ).toBeInTheDocument();
    const spigen = screen.getByText("Spigen").closest("tr") as HTMLElement;
    const zagg = screen.getByText("Zagg").closest("tr") as HTMLElement;
    expect(
      within(spigen).getByRole("link", {
        name: d.productsLinkAria(12, "Spigen"),
      }),
    ).toHaveAttribute("href", "/products?brandId=b1");
    expect(within(zagg).getByText("0")).toBeInTheDocument();
  });

  it("explains the «Товарів» column through an ⓘ that the keyboard reaches", async () => {
    stubBrands([makeBrandRow("b1", "Spigen", true, { productCount: 1 })]);
    renderWithProviders(<AdminBrandTable />);
    await screen.findByText("Spigen");

    expect(
      screen.getByRole("button", { name: d.colProductsHintAria }),
    ).toHaveAccessibleDescription(d.colProductsHint);
  });

  it("keeps the count plain for a session that cannot open «Товари»", async () => {
    stubBrands([makeBrandRow("b1", "Spigen", true, { productCount: 12 })]);
    renderWithProviders(<AdminBrandTable />, {
      auth: { permissions: [PERM.brandsWrite] },
    });
    const row = (await screen.findByText("Spigen")).closest(
      "tr",
    ) as HTMLElement;
    expect(within(row).getByText("12")).toBeInTheDocument();
    expect(within(row).queryByRole("link", { name: /12/ })).toBeNull();
  });

  it("says «Показується / Приховано»", async () => {
    stubBrands([
      makeBrandRow("b1", "Spigen"),
      makeBrandRow("b2", "Zagg", false),
    ]);
    renderWithProviders(<AdminBrandTable />);
    await screen.findByText("Spigen");
    expect(screen.getByText(d.statusActive)).toBeInTheDocument();
    expect(screen.getByText(d.statusInactive)).toBeInTheDocument();
  });

  it("renders a skeleton with the registry's columns while loading", async () => {
    server.use(
      http.get("*/api/brands/admin/list", async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );

    renderWithProviders(<AdminBrandTable />);

    expect(
      await screen.findByRole("columnheader", { name: d.colLogo }),
    ).toBeInTheDocument();
  });
});

describe("AdminBrandTable — «⋯» (БР2, БР4)", () => {
  it("offers Редагувати · Товари бренду · Приховати з сайту… to a writer", async () => {
    stubBrands([makeBrandRow("b1", "Apple", true, { productCount: 29 })]);
    renderWithProviders(<AdminBrandTable />, { auth: WRITER });

    const menu = await openRowMenu("Apple");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([dict.common.edit, d.rowProducts(29), d.deactivate]);
    expect(
      within(menu).getByRole("menuitem", { name: dict.common.edit }),
    ).toHaveAttribute("href", "/brands/b1/edit");
    expect(
      within(menu).getByRole("menuitem", { name: d.rowProducts(29) }),
    ).toHaveAttribute("href", "/products?brandId=b1");
  });

  it("asks before hiding, says what happens to the products, then hides", async () => {
    stubBrands([makeBrandRow("b1", "Apple", true, { productCount: 29 })]);
    const patches: unknown[] = [];
    server.use(
      http.patch("*/api/brands/b1/status", async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json({ data: makeBrandRow("b1", "Apple", false) });
      }),
    );
    renderWithProviders(<AdminBrandTable />, { auth: WRITER });

    const menu = await openRowMenu("Apple");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: d.deactivate }),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(d.hideTitle("Apple"))).toBeInTheDocument();
    expect(dialog).toHaveTextContent(d.hideBody(29));
    expect(patches).toHaveLength(0);

    await userEvent.click(
      within(dialog).getByRole("button", { name: d.hideAction }),
    );
    await waitFor(() => expect(patches).toEqual([{ isActive: false }]));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(d.toastDeactivated),
    );
  });

  it("shows a hidden brand again straight away — nothing to warn about", async () => {
    stubBrands([makeBrandRow("b2", "Huawei", false, { productCount: 2 })]);
    const patches: unknown[] = [];
    server.use(
      http.patch("*/api/brands/b2/status", async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json({ data: makeBrandRow("b2", "Huawei") });
      }),
    );
    renderWithProviders(<AdminBrandTable />, { auth: WRITER });

    const menu = await openRowMenu("Huawei");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: d.activate }),
    );
    await waitFor(() => expect(patches).toEqual([{ isActive: true }]));
  });

  it("leaves a view-only session «Переглянути» and the products link only", async () => {
    stubBrands([makeBrandRow("b1", "Apple", true, { productCount: 29 })]);
    renderWithProviders(<AdminBrandTable />, {
      auth: { permissions: [PERM.productsRead] },
    });

    const menu = await openRowMenu("Apple");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([dict.common.view, d.rowProducts(29)]);
  });
});
