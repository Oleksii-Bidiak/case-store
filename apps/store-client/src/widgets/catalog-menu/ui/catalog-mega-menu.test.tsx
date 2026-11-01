import { http, HttpResponse, delay } from "msw";
import {
  act,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { DeviceModelListItemEntity } from "@/entities/device";
import {
  MY_DEVICES_STORAGE_KEY,
  closeDevicePicker,
  getDevicePickerState,
  readMyDevices,
  type MyDevice,
} from "@/entities/my-devices";
import { XL_VIEWPORT_QUERY } from "../model/use-xl-viewport";
import { CatalogMegaMenu } from "./catalog-mega-menu";
import { CATALOG_TREE, blockNavigation, setViewport } from "./test-fixtures";

const t = dict.catalogMenu;

const MODELS_API = "http://localhost:3001/api/device-models";

function model(
  id: string,
  name: string,
  productCount: number,
): DeviceModelListItemEntity {
  return {
    id,
    deviceBrandId: "brand-apple",
    name,
    slug: id,
    series: null,
    releaseYear: 2023,
    brandName: "Apple",
    brandSlug: "apple",
    productCount,
  };
}

const MODELS = [
  model("iphone-16-pro", "iPhone 16 Pro", 140),
  model("iphone-15-pro", "iPhone 15 Pro", 128),
  model("iphone-15", "iPhone 15", 96),
  model("iphone-13", "iPhone 13", 60),
  model("iphone-12", "iPhone 12", 40),
];

const PRO: MyDevice = {
  modelId: "id-iphone-15-pro",
  slug: "iphone-15-pro",
  name: "iPhone 15 Pro",
  brandName: "Apple",
  family: "iphone",
  lastUsedAt: 1_000_000,
};

function compatPage(categoryId: string, name: string, productCount: number) {
  return {
    categoryId,
    categorySlug: categoryId,
    categoryName: name,
    deviceModelId: PRO.modelId,
    deviceSlug: PRO.slug,
    deviceName: PRO.name,
    productCount,
  };
}

let unblockNavigation = () => {};
let compatRequests = 0;
let modelRequests = 0;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  window.localStorage.clear();
  unblockNavigation = blockNavigation();
  compatRequests = 0;
  modelRequests = 0;
  setViewport({ [XL_VIEWPORT_QUERY]: true });
  server.use(
    http.get("*/api/categories/tree", () =>
      HttpResponse.json({ data: CATALOG_TREE }),
    ),
    http.get("*/api/catalog/compat-pages", () => {
      compatRequests += 1;
      const pages = [
        compatPage("cases", "Чохли", 40),
        compatPage("cables", "Кабелі та перехідники", 22),
        compatPage("memory", "Карти пам’яті та флешки", 3),
      ];
      return HttpResponse.json({ data: pages, meta: { total: pages.length } });
    }),
    http.get(MODELS_API, () => {
      modelRequests += 1;
      return HttpResponse.json({ data: MODELS });
    }),
  );
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  unblockNavigation();
  act(() => closeDevicePicker());
});

function renderMenu() {
  const onClose = jest.fn();
  const user = userEvent.setup();
  renderWithProviders(<CatalogMegaMenu onClose={onClose} />);
  return { onClose, user };
}

function roots() {
  return screen.getByRole("navigation", { name: t.mega.rootsAria });
}

function rootLink(name: string) {
  return within(roots()).getByRole("link", { name });
}

/** The pane heading — the active root's name. */
function paneHeading() {
  return screen.getByRole("heading", { level: 2 });
}

describe("CatalogMegaMenu — roots and tiles (TASK-2072)", () => {
  it("lists the roots with their sprite icons and opens on the first root's tiles", async () => {
    renderMenu();

    expect(await screen.findByRole("link", { name: "Чохли" })).toHaveAttribute(
      "href",
      "/categories/cases",
    );
    const rows = within(roots()).getAllByRole("link");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Чохли",
      "Кабелі та перехідники",
      "Карти пам’яті та флешки",
    ]);
    // Icons from the sprite; an unknown key falls back to the folder.
    expect(
      rows[0]
        .querySelector("[data-category-icon]")
        ?.getAttribute("data-category-icon"),
    ).toBe("cases");
    expect(
      rows[2]
        .querySelector("[data-category-icon]")
        ?.getAttribute("data-category-icon"),
    ).toBe("folder");

    expect(paneHeading()).toHaveTextContent("Чохли");
    expect(
      screen.getByRole("link", { name: "Чохли для iPhone" }),
    ).toHaveAttribute("href", "/categories/iphone-cases");
    expect(
      screen.getByRole("link", { name: "Чохли для Samsung" }),
    ).toHaveAttribute("href", "/categories/samsung-cases");
  });

  it("heads the pane with «Усі →» to the active root", async () => {
    renderMenu();
    await screen.findByRole("link", { name: "Чохли" });

    const all = screen.getByRole("link", { name: t.mega.allInAria("Чохли") });
    expect(all).toHaveAttribute("href", "/categories/cases");
    expect(all).toHaveTextContent(t.mega.allIn());
  });

  it("shows four level-3 links under a tile, then «Ще N →» to the tile's category", async () => {
    renderMenu();
    await screen.findByRole("link", { name: "Чохли" });

    for (const name of ["З MagSafe", "Силіконові", "Шкіряні", "Прозорі"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("link", { name: "Книжки" }),
    ).not.toBeInTheDocument();
    const more = screen.getByRole("link", {
      name: t.mega.moreAria(1, "Чохли для iPhone"),
    });
    expect(more).toHaveTextContent(t.mega.more(1));
    expect(more).toHaveAttribute("href", "/categories/iphone-cases");
    // Level 4 never appears in the menu.
    expect(
      screen.queryByRole("link", { name: "Силіконові з MagSafe" }),
    ).not.toBeInTheDocument();
  });

  it("switches the pane when the pointer rests on another root", async () => {
    const { user } = renderMenu();
    await screen.findByRole("link", { name: "Чохли" });

    await user.hover(rootLink("Кабелі та перехідники"));

    await waitFor(() =>
      expect(paneHeading()).toHaveTextContent("Кабелі та перехідники"),
    );
    expect(
      screen.getByRole("link", { name: "Кабелі USB-C" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Чохли для iPhone" }),
    ).not.toBeInTheDocument();
  });

  it("does not switch the pane when the pointer only passes over a root", async () => {
    const { user } = renderMenu();
    await screen.findByRole("link", { name: "Чохли" });

    await user.hover(rootLink("Кабелі та перехідники"));
    await user.unhover(rootLink("Кабелі та перехідники"));
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(paneHeading()).toHaveTextContent("Чохли");
  });

  it("switches the pane at once when a root takes focus", async () => {
    renderMenu();
    await screen.findByRole("link", { name: "Чохли" });

    act(() => rootLink("Кабелі та перехідники").focus());

    expect(paneHeading()).toHaveTextContent("Кабелі та перехідники");
  });

  it("shows a root without children as its own single tile", async () => {
    renderMenu();
    await screen.findByRole("link", { name: "Чохли" });

    act(() => rootLink("Карти пам’яті та флешки").focus());

    const tiles = screen.getAllByRole("link", {
      name: "Карти пам’яті та флешки",
    });
    // The root row and the one tile, both to the root's page.
    expect(tiles).toHaveLength(2);
    tiles.forEach((tile) =>
      expect(tile).toHaveAttribute("href", "/categories/memory"),
    );
  });

  it("closes on every link it offers", async () => {
    const { user, onClose } = renderMenu();
    await screen.findByRole("link", { name: "Чохли" });

    await user.click(screen.getByRole("link", { name: "Шкіряні" }));
    await user.click(
      screen.getByRole("link", { name: dict.header.catalogAllProducts }),
    );

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("offers the category index and the flat catalogue in the footer", async () => {
    renderMenu();
    await screen.findByRole("link", { name: "Чохли" });

    expect(
      screen.getByRole("link", { name: dict.header.catalogAll }),
    ).toHaveAttribute("href", "/categories");
    expect(
      screen.getByRole("link", { name: dict.header.catalogAllProducts }),
    ).toHaveAttribute("href", "/products");
  });
});

describe("CatalogMegaMenu — keyboard (TASK-413, TASK-2072)", () => {
  async function onFirstRoot() {
    const opened = renderMenu();
    const first = await screen.findByRole("link", { name: "Чохли" });
    act(() => first.focus());
    return { ...opened, first };
  }

  it("makes the roots one tab stop that follows the active root", async () => {
    const { user } = await onFirstRoot();

    expect(rootLink("Чохли")).toHaveAttribute("tabindex", "0");
    expect(rootLink("Кабелі та перехідники")).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{ArrowDown}");
    expect(rootLink("Кабелі та перехідники")).toHaveAttribute("tabindex", "0");
    expect(rootLink("Чохли")).toHaveAttribute("tabindex", "-1");
  });

  it("walks the roots with ↑/↓ (wrapping) and Home/End, previewing each", async () => {
    const { user } = await onFirstRoot();

    await user.keyboard("{ArrowDown}");
    expect(rootLink("Кабелі та перехідники")).toHaveFocus();
    expect(paneHeading()).toHaveTextContent("Кабелі та перехідники");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(rootLink("Чохли")).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(rootLink("Карти пам’яті та флешки")).toHaveFocus();

    await user.keyboard("{Home}");
    expect(rootLink("Чохли")).toHaveFocus();
    await user.keyboard("{End}");
    expect(rootLink("Карти пам’яті та флешки")).toHaveFocus();
  });

  it("jumps into the pane with → and back to the active root with ←", async () => {
    const { user, first } = await onFirstRoot();

    await user.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("link", { name: "Чохли для iPhone" }),
    ).toHaveFocus();

    // ← works from any pane link, sub-links included.
    await user.tab();
    expect(screen.getByRole("link", { name: "З MagSafe" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(first).toHaveFocus();
  });
});

describe("CatalogMegaMenu — states", () => {
  it("shows skeleton rows while the tree is loading", () => {
    server.use(
      http.get("*/api/categories/tree", async () => {
        await delay("infinite");
        return HttpResponse.json({ data: [] });
      }),
    );
    renderMenu();

    expect(screen.getAllByRole("status", { hidden: true })).toHaveLength(6);
    expect(within(roots()).queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the error state when the tree request fails", async () => {
    server.use(
      http.get("*/api/categories/tree", () =>
        HttpResponse.json(
          { error: "Internal", message: "boom", statusCode: 500 },
          { status: 500 },
        ),
      ),
    );
    renderMenu();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.catalog.categoriesError,
    );
  });

  it("shows the empty state and keeps the two exits when there are no roots", async () => {
    server.use(
      http.get("*/api/categories/tree", () => HttpResponse.json({ data: [] })),
    );
    renderMenu();

    expect(
      await screen.findByText(dict.catalog.noCategories),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.header.catalogAll }),
    ).toHaveAttribute("href", "/categories");
  });
});

describe("CatalogMegaMenu — «Ваш пристрій» column (xl)", () => {
  function seed(devices: MyDevice[]) {
    window.localStorage.setItem(
      MY_DEVICES_STORAGE_KEY,
      JSON.stringify(devices),
    );
  }

  it("lists the device's categories with real counts and leads to its hub", async () => {
    seed([PRO]);
    const { user, onClose } = renderMenu();

    const column = await screen.findByRole("region", {
      name: t.device.kicker,
    });
    expect(within(column).getByText("iPhone 15 Pro")).toBeInTheDocument();

    const list = await within(column).findByRole("list", {
      name: t.device.categoriesAria("iPhone 15 Pro"),
    });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/catalog/cases/iphone-15-pro",
      "/catalog/cables/iphone-15-pro",
      "/catalog/memory/iphone-15-pro",
    ]);
    expect(links[0]).toHaveTextContent("40");

    const hub = within(column).getByRole("link", {
      name: t.device.allFor("iPhone 15 Pro"),
    });
    expect(hub).toHaveAttribute("href", "/devices/iphone-15-pro");
    await user.click(hub);
    expect(onClose).toHaveBeenCalled();
  });

  it("asks for nothing below xl, where the column is not on screen", async () => {
    seed([PRO]);
    setViewport({});
    renderMenu();
    await screen.findByRole("link", { name: "Чохли" });

    expect(compatRequests).toBe(0);
  });

  it("without a device: popular chips save the model in place", async () => {
    const { user } = renderMenu();

    const column = await screen.findByRole("region", {
      name: t.device.pickKicker,
    });
    const chips = await within(column).findByRole("list", {
      name: t.device.popularAria,
    });
    expect(
      within(chips)
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["iPhone 16 Pro", "iPhone 15 Pro", "iPhone 15", "iPhone 13"]);

    await user.click(within(chips).getByRole("button", { name: "iPhone 15" }));

    expect(readMyDevices()[0]?.slug).toBe("iphone-15");
    const saved = await screen.findByRole("region", { name: t.device.kicker });
    // Focus moves to the new column's primary link, not to <body>.
    expect(
      within(saved).getByRole("link", { name: t.device.allFor("iPhone 15") }),
    ).toHaveFocus();
  });

  it("without a device: «Усі моделі» closes the panel and opens the picker", async () => {
    const { user, onClose } = renderMenu();

    await user.click(
      await screen.findByRole("button", { name: t.device.allModels }),
    );

    expect(onClose).toHaveBeenCalled();
    expect(getDevicePickerState().open).toBe(true);
  });

  it("without a device and below xl: no model request", async () => {
    setViewport({});
    renderMenu();
    await screen.findByRole("link", { name: "Чохли" });

    expect(modelRequests).toBe(0);
  });
});
