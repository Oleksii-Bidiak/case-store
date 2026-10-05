/**
 * `DeviceModelTable` — TASK-357 toolbar, TASK-423 filters, and the registry of
 * wave 198 (DevicesProposal ПР1–ПР4, ПР10, TASK-1082).
 *
 * The first cases keep proving the old abilities are still there after the
 * move onto the shared registry — refresh, the labelled search, the brand and
 * status filters (now the filter sheet and the quick views), «Редагувати»,
 * the visibility toggle, pagination.
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
import { dict, STOREFRONT_URL } from "@/shared/config";
import { PERM } from "@/entities/permission";
import { DeviceModelTable } from "./device-model-table";

const d = dict.devices;

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/devices/models",
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const WRITER = { permissions: [PERM.devicesWrite, PERM.productsRead] };
const SAMSUNG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
  localStorage.clear();
});

function makeModelRow(
  id: string,
  name: string,
  extra: { isActive?: boolean; series?: string | null } = {},
) {
  return {
    id,
    deviceBrandId: "brand-1",
    brandName: "Apple",
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    series: extra.series === undefined ? "iPhone 16" : extra.series,
    releaseYear: 2024,
    isActive: extra.isActive ?? true,
    metaTitle: null,
    metaDescription: null,
    description: null,
  };
}

/** One-row requests (`limit=1`) are view counters; the rest is the page. */
function stubModels(
  rows: ReturnType<typeof makeModelRow>[],
  counts = { all: rows.length, shown: rows.length, hidden: 0 },
) {
  const requests: URL[] = [];
  server.use(
    http.get("*/api/admin/devices/models", ({ request }) => {
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
    http.get("*/api/admin/devices/brands", () =>
      HttpResponse.json({
        data: [
          {
            id: "brand-1",
            name: "Apple",
            slug: "apple",
            isActive: true,
            sortOrder: 0,
          },
          {
            id: SAMSUNG,
            name: "Samsung",
            slug: "samsung",
            isActive: true,
            sortOrder: 1,
          },
        ],
      }),
    ),
    http.get("*/api/catalog/compat-pages", () =>
      HttpResponse.json({
        data: [
          compatPage("m1", "chokhly", "Чохли"),
          compatPage("m1", "sklo", "Захисне скло"),
          compatPage("m1", "zariadky", "Зарядні пристрої"),
        ],
        meta: { total: 3 },
      }),
    ),
  );
  return requests;
}

function compatPage(
  modelId: string,
  categorySlug: string,
  categoryName: string,
) {
  return {
    categoryId: `c-${categorySlug}`,
    categorySlug,
    categoryName,
    deviceModelId: modelId,
    deviceSlug: "iphone-16-pro",
    deviceName: "iPhone 16 Pro",
    productCount: 5,
  };
}

async function openRowMenu(name: string) {
  await userEvent.click(
    await screen.findByRole("button", { name: d.modelRowActionsAria(name) }),
  );
  return screen.findByRole("menu");
}

describe("DeviceModelTable — toolbar (TASK-357)", () => {
  it("refetches on demand — the point of the refresh control", async () => {
    const requests = stubModels([makeModelRow("m1", "iPhone 16 Pro")]);

    renderWithProviders(<DeviceModelTable />);
    await screen.findByText("iPhone 16 Pro");
    expect(requests).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(requests).toHaveLength(2));
  });

  it("labels the search box as a search, not as the page heading", async () => {
    stubModels([makeModelRow("m1", "iPhone 16 Pro")]);

    renderWithProviders(<DeviceModelTable />);
    await screen.findByText("iPhone 16 Pro");

    expect(screen.getByLabelText(d.modelsSearchAria)).toBeInTheDocument();
    // The table is named after the tab, the search box after the search.
    expect(
      screen.getByRole("searchbox", { name: d.modelsSearchAria }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("searchbox", { name: d.tabModels }),
    ).not.toBeInTheDocument();
  });

  // An empty page under an active search must not read as "no models yet".
  it("distinguishes an empty search result from an empty table", async () => {
    mockSearchParams = new URLSearchParams("search=невідоме");
    stubModels([]);

    renderWithProviders(<DeviceModelTable />);

    expect(
      await screen.findByText(dict.common.registry.noResults("невідоме")),
    ).toBeInTheDocument();
    expect(screen.queryByText(d.modelsEmpty)).not.toBeInTheDocument();
  });
});

describe("DeviceModelTable — views and filters (ПР1–ПР3)", () => {
  it("draws «Усі · Показуються · Приховані» with the API's counts and keeps `?isActive=`", async () => {
    stubModels([makeModelRow("m1", "iPhone 16 Pro")], {
      all: 40,
      shown: 39,
      hidden: 1,
    });
    renderWithProviders(<DeviceModelTable />);
    await screen.findByText("iPhone 16 Pro");

    const views = screen.getByRole("tablist", {
      name: dict.common.registry.quickViewsLabel,
    });
    await waitFor(() =>
      expect(within(views).getByRole("tab", { name: /Усі/ })).toHaveTextContent(
        "40",
      ),
    );
    expect(
      within(views).getByRole("tab", { name: new RegExp(d.viewShown) }),
    ).toHaveTextContent("39");
    // «Без товарів» needs a per-model product count — not drawn (API tail).
    expect(
      within(views).queryByRole("tab", { name: /товарів/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(views).getByRole("tab", { name: new RegExp(d.viewHidden) }),
    );
    expect(mockReplace).toHaveBeenCalledWith("/devices/models?isActive=false");
  });

  it("forwards the brand and status of the URL to the server", async () => {
    mockSearchParams = new URLSearchParams(
      `deviceBrandId=${SAMSUNG}&isActive=true&search=galaxy`,
    );
    const requests = stubModels([makeModelRow("m1", "Galaxy S24")]);
    renderWithProviders(<DeviceModelTable />);
    await screen.findByText("Galaxy S24");

    expect(requests[0].searchParams.get("deviceBrandId")).toBe(SAMSUNG);
    expect(requests[0].searchParams.get("isActive")).toBe("true");
    expect(requests[0].searchParams.get("search")).toBe("galaxy");
  });

  it("shows the brand filter as «Бренд: Samsung» — no technical prefix", async () => {
    mockSearchParams = new URLSearchParams(`deviceBrandId=${SAMSUNG}`);
    stubModels([makeModelRow("m1", "Galaxy S24")]);
    renderWithProviders(<DeviceModelTable />);
    await screen.findByText("Galaxy S24");

    expect(await screen.findByText(d.chipBrand("Samsung"))).toBeInTheDocument();
    expect(screen.queryByText(/Фільтр за брендом/)).not.toBeInTheDocument();
  });

  it("keeps a removable chip for a brand id that no longer exists", async () => {
    mockSearchParams = new URLSearchParams("deviceBrandId=gone-brand");
    stubModels([]);
    renderWithProviders(<DeviceModelTable />);

    await userEvent.click(
      await screen.findByRole("button", {
        name: dict.common.registry.removeChipAria(
          d.chipBrand(d.chipBrandUnknown),
        ),
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith("/devices/models");
  });

  it("picks the brand in the filter sheet through a searchable combobox", async () => {
    stubModels([makeModelRow("m1", "iPhone 16 Pro")]);
    renderWithProviders(<DeviceModelTable />);
    await screen.findByText("iPhone 16 Pro");

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.registry.filters }),
    );
    const sheet = await screen.findByRole("dialog");
    const combobox = within(sheet).getByRole("combobox", {
      name: d.filterBrand,
    });
    await userEvent.type(combobox, "sam");
    await userEvent.click(
      await within(sheet).findByRole("option", { name: "Samsung" }),
    );
    await userEvent.click(
      within(sheet).getByRole("button", { name: d.filtersApply }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      `/devices/models?deviceBrandId=${SAMSUNG}`,
    );
  });
});

describe("DeviceModelTable — rows and «⋯» (ПР1, ПР2, ПР10)", () => {
  it("puts the series under the name and counts the live compatibility pages", async () => {
    stubModels([
      makeModelRow("m1", "iPhone 16 Pro"),
      makeModelRow("m2", "Galaxy A35", { series: "Galaxy A" }),
    ]);
    renderWithProviders(<DeviceModelTable />);

    const row = (await screen.findByText("iPhone 16 Pro")).closest(
      "tr",
    ) as HTMLElement;
    expect(within(row).getByText("iPhone 16")).toBeInTheDocument();
    await waitFor(() => expect(within(row).getByText("3")).toBeInTheDocument());
    const empty = screen.getByText("Galaxy A35").closest("tr") as HTMLElement;
    expect(within(empty).getByText("—")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: d.colPagesHintAria }),
    ).toHaveAccessibleDescription(d.colPagesHint);
  });

  it("offers Редагувати · Сумісні товари · Каталог на сайті · Приховати з сайту…", async () => {
    stubModels([makeModelRow("m1", "iPhone 16 Pro")]);
    renderWithProviders(<DeviceModelTable />, { auth: WRITER });

    const menu = await openRowMenu("iPhone 16 Pro");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      dict.common.edit,
      d.rowCompatProducts,
      d.rowOpenCatalog,
      d.hideModelItem,
    ]);
    expect(
      within(menu).getByRole("menuitem", { name: dict.common.edit }),
    ).toHaveAttribute("href", "/devices/models/m1/edit");
    expect(
      within(menu).getByRole("menuitem", { name: d.rowCompatProducts }),
    ).toHaveAttribute("href", "/products?deviceModelId=m1");
    const site = within(menu).getByRole("menuitem", { name: d.rowOpenCatalog });
    expect(site).toHaveAttribute(
      "href",
      `${STOREFRONT_URL}/catalog?device=iphone-16-pro`,
    );
    expect(site).toHaveAttribute("target", "_blank");
  });

  it("asks before hiding and names how many pages stop opening", async () => {
    stubModels([makeModelRow("m1", "iPhone 16 Pro")]);
    const calls: string[] = [];
    server.use(
      http.patch("*/api/admin/devices/models/m1/deactivate", () => {
        calls.push("deactivate");
        return HttpResponse.json({ data: makeModelRow("m1", "iPhone 16 Pro") });
      }),
    );
    renderWithProviders(<DeviceModelTable />, { auth: WRITER });
    await screen.findByText("iPhone 16 Pro");
    // Wait for the page counts, so the dialog can name them.
    const row = screen.getByText("iPhone 16 Pro").closest("tr") as HTMLElement;
    await waitFor(() => expect(within(row).getByText("3")).toBeInTheDocument());

    const menu = await openRowMenu("iPhone 16 Pro");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: d.hideModelItem }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(d.hideModelTitle("iPhone 16 Pro")),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(d.hideModelBody(3));
    expect(calls).toHaveLength(0);

    await userEvent.click(
      within(dialog).getByRole("button", { name: d.hideAction }),
    );
    await waitFor(() => expect(calls).toEqual(["deactivate"]));
  });

  it("does not promise «no pages» when the page count failed to load", async () => {
    stubModels([makeModelRow("m1", "iPhone 16 Pro")]);
    server.use(
      http.get("*/api/catalog/compat-pages", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(<DeviceModelTable />, { auth: WRITER });
    await screen.findByText("iPhone 16 Pro");

    const menu = await openRowMenu("iPhone 16 Pro");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: d.hideModelItem }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(d.hideModelBodyUnknown);
    expect(dialog).not.toHaveTextContent(d.hideModelBody(0));
  });

  it("shows a hidden model again straight away, and links no site catalog for it", async () => {
    stubModels([makeModelRow("m2", "Redmi Note 13", { isActive: false })]);
    const calls: string[] = [];
    server.use(
      http.patch("*/api/admin/devices/models/m2/activate", () => {
        calls.push("activate");
        return HttpResponse.json({ data: makeModelRow("m2", "Redmi Note 13") });
      }),
    );
    renderWithProviders(<DeviceModelTable />, { auth: WRITER });

    const menu = await openRowMenu("Redmi Note 13");
    expect(
      within(menu).queryByRole("menuitem", { name: d.rowOpenCatalog }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: d.activate }),
    );
    await waitFor(() => expect(calls).toEqual(["activate"]));
  });

  it("leaves a view-only session «Переглянути» and the links", async () => {
    stubModels([makeModelRow("m1", "iPhone 16 Pro")]);
    renderWithProviders(<DeviceModelTable />);

    const menu = await openRowMenu("iPhone 16 Pro");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([dict.common.view, d.rowOpenCatalog]);
  });
});
