import { http, HttpResponse } from "msw";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import {
  MY_DEVICES_STORAGE_KEY,
  closeDevicePicker,
  getDevicePickerState,
  openDevicePicker,
  readMyDevices,
  type MyDevice,
} from "@/entities/my-devices";
import {
  HAS_DEVICE_ATTR,
  RESERVE_TIER_TWO_SCRIPT,
} from "../model/reserve-tier-two";
import { WIDE_VIEWPORT_QUERY } from "../model/use-wide-viewport";
import { DeviceBar } from "./device-bar";

const t = dict.devicePicker.bar;

function device(
  slug: string,
  name: string,
  over: Partial<MyDevice> = {},
): MyDevice {
  return {
    modelId: `id-${slug}`,
    slug,
    name,
    brandName: "Apple",
    family: "iphone",
    lastUsedAt: 0,
    ...over,
  };
}

/** Saves devices most-recent first (the first is active). */
function seed(devices: MyDevice[]): void {
  const now = 1_000_000;
  window.localStorage.setItem(
    MY_DEVICES_STORAGE_KEY,
    JSON.stringify(devices.map((d, i) => ({ ...d, lastUsedAt: now - i }))),
  );
}

const PRO = device("iphone-15-pro", "iPhone 15 Pro");
const WATCH = device("watch-s10-46", "Apple Watch Series 10 46 мм", {
  family: "watch",
});
const IPAD = device("ipad-air-11", "iPad Air 11″ (M2)", { family: "ipad" });
const MOM = device("iphone-13", "iPhone 13", { label: "Мама" });
const S24 = device("galaxy-s24", "Galaxy S24", {
  brandName: "Samsung",
  family: "galaxy",
});

// Icons (TASK-1956): one set, one null, one key the sprite does not have.
const TREE = [
  { id: "cases", slug: "cases", name: "Чохли", icon: "cases" },
  {
    id: "glass",
    slug: "screen-protectors",
    name: "Захисне скло та плівки",
    icon: null,
  },
  {
    id: "chargers",
    slug: "chargers",
    name: "Зарядні пристрої",
    icon: "rocket",
  },
].map((c, i) => ({ ...c, isActive: true, sortOrder: i, children: [] }));

function compatPage(
  categoryId: string,
  categorySlug: string,
  categoryName: string,
  deviceSlug: string,
  productCount: number,
) {
  return {
    categoryId,
    categorySlug,
    categoryName,
    deviceModelId: `id-${deviceSlug}`,
    deviceSlug,
    deviceName: deviceSlug,
    productCount,
  };
}

const PAGES = [
  compatPage("cases", "cases", "Чохли", "iphone-15-pro", 40),
  compatPage(
    "iphone-cases",
    "iphone-cases",
    "Чохли для iPhone",
    "iphone-15-pro",
    40,
  ),
  compatPage(
    "glass",
    "screen-protectors",
    "Захисне скло та плівки",
    "iphone-15-pro",
    18,
  ),
  compatPage("chargers", "chargers", "Зарядні пристрої", "iphone-15-pro", 22),
  compatPage("cases", "cases", "Чохли", "watch-s10-46", 6),
];

let compatRequests = 0;
const originalMatchMedia = window.matchMedia;

function setViewport(wide: boolean): void {
  window.matchMedia = (query: string) =>
    ({
      matches: wide && query === WIDE_VIEWPORT_QUERY,
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
  window.localStorage.clear();
  compatRequests = 0;
  setViewport(true);
  server.use(
    http.get("*/api/catalog/compat-pages", () => {
      compatRequests += 1;
      return HttpResponse.json({ data: PAGES, meta: { total: PAGES.length } });
    }),
    http.get("*/api/categories/tree", () => HttpResponse.json({ data: TREE })),
  );
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  act(() => closeDevicePicker());
});

describe("DeviceBar — tier 1 (TASK-2074)", () => {
  it("with no device: one dashed pick button that opens the picker, no tier 2, no request", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DeviceBar />);

    const pick = screen.getByRole("button", { name: new RegExp(t.pick) });
    expect(pick).toHaveTextContent(t.pickHint);
    expect(
      screen.queryByRole("group", { name: t.groupAria }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();

    await user.click(pick);
    expect(getDevicePickerState().open).toBe(true);
    expect(compatRequests).toBe(0);
  });

  it("with one device: «Ваш:» + name chip, ✕, «+», «Мої пристрої»", () => {
    seed([PRO]);
    renderWithProviders(<DeviceBar />);

    const group = screen.getByRole("group", { name: t.groupAria });
    const chip = within(group).getByRole("button", {
      name: t.activeAria(PRO.name),
    });
    expect(chip).toHaveTextContent(`${t.yours}${PRO.name}`);
    expect(
      within(group).getByRole("button", { name: t.forgetAria(PRO.name) }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("button", { name: t.add }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.myDevices })).toHaveAttribute(
      "href",
      "/devices",
    );
  });

  it("with five devices: chip without «Ваш:», «ще 4» inside it, two idle pills and «ще 2»", () => {
    seed([PRO, MOM, WATCH, IPAD, S24]);
    renderWithProviders(<DeviceBar />);

    const group = screen.getByRole("group", { name: t.groupAria });
    const chip = within(group).getByRole("button", {
      name: t.activeAria(PRO.name),
    });
    expect(chip).not.toHaveTextContent(t.yours);
    // Below 1024 the chip counts every other device itself.
    expect(within(chip).getByText(t.more(4))).toHaveClass("lg:hidden");

    // From 1024: the two most recent others as pills (label shown), then «ще 2».
    const momPill = within(group).getByRole("button", {
      name: t.showForAria(MOM.name, MOM.label),
    });
    expect(momPill).toHaveTextContent("iPhone 13 · Мама");
    expect(momPill).toHaveClass("hidden", "lg:inline-flex");
    expect(
      within(group).getByRole("button", {
        name: t.showForAria(WATCH.name),
      }),
    ).toBeInTheDocument();
    expect(
      within(group).queryByRole("button", { name: t.showForAria(IPAD.name) }),
    ).not.toBeInTheDocument();
    expect(
      within(group).getByRole("button", { name: t.moreAria(2) }),
    ).toHaveTextContent(t.more(2));
  });

  it("an idle pill makes its device active; ✕ forgets the active one", async () => {
    const user = userEvent.setup();
    seed([PRO, WATCH]);
    renderWithProviders(<DeviceBar />);

    await user.click(
      screen.getByRole("button", { name: t.showForAria(WATCH.name) }),
    );
    expect(readMyDevices().map((d) => d.slug)).toEqual([WATCH.slug, PRO.slug]);
    expect(
      await screen.findByRole("button", { name: t.activeAria(WATCH.name) }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: t.forgetAria(WATCH.name) }),
    );
    expect(readMyDevices().map((d) => d.slug)).toEqual([PRO.slug]);
    expect(
      await screen.findByRole("button", { name: t.activeAria(PRO.name) }),
    ).toHaveTextContent(t.yours);
  });

  it("«+» and «ще N» open the picker", async () => {
    const user = userEvent.setup();
    seed([PRO, MOM, WATCH, IPAD]);
    renderWithProviders(<DeviceBar />);

    await user.click(screen.getByRole("button", { name: t.add }));
    expect(getDevicePickerState().open).toBe(true);
    act(() => closeDevicePicker());

    await user.click(screen.getByRole("button", { name: t.moreAria(1) }));
    expect(getDevicePickerState().open).toBe(true);
  });
});

describe("DeviceBar — tier 2 and the «Усі категорії» panel (TASK-2074)", () => {
  it("lists the active device's root categories, most products first, linking the compat pages", async () => {
    seed([PRO]);
    renderWithProviders(<DeviceBar />);

    const nav = await screen.findByRole("navigation", {
      name: t.categoriesAria(PRO.name),
    });
    expect(nav).toHaveTextContent(t.categoriesFor(PRO.name));
    const links = await within(nav).findAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/catalog/cases/iphone-15-pro",
      "/catalog/chargers/iphone-15-pro",
      "/catalog/screen-protectors/iphone-15-pro",
    ]);
    // TASK-1956: the root's sprite key; null and unknown keys → folder.
    expect(
      links.map((a) => a.querySelector("use")?.getAttribute("href")),
    ).toEqual([
      "/icons/categories.svg#cat-cases",
      "/icons/categories.svg#cat-folder",
      "/icons/categories.svg#cat-folder",
    ]);
    // Subcategory rows from compat-pages are not repeated here.
    expect(within(nav).queryByText("Чохли для iPhone")).not.toBeInTheDocument();
    expect(
      within(nav).getByRole("button", { name: new RegExp(t.allCategories(3)) }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("does not request the categories below 1024", () => {
    setViewport(false);
    seed([PRO]);
    renderWithProviders(<DeviceBar />);
    expect(compatRequests).toBe(0);
  });

  it("toggles the full-width panel; Escape closes it and returns focus", async () => {
    const user = userEvent.setup();
    seed([PRO]);
    renderWithProviders(<DeviceBar />);

    const toggle = await screen.findByRole("button", {
      name: new RegExp(t.allCategories(3)),
    });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const panel = screen.getByRole("region", {
      name: t.panelTitle(PRO.name),
    });
    expect(
      within(panel).getByRole("link", { name: /Відкрити сторінку моделі/ }),
    ).toHaveAttribute("href", "/devices/iphone-15-pro");
    expect(panel).toHaveTextContent(
      t.openModelPage(dict.devicePicker.productCount(80)),
    );
    expect(within(panel).getAllByRole("listitem")).toHaveLength(3);
    expect(
      within(panel)
        .getAllByRole("listitem")[0]
        .querySelector("use")
        ?.getAttribute("href"),
    ).toBe("/icons/categories.svg#cat-cases");
    expect(panel).toHaveTextContent(dict.devicePicker.productCount(40));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("Escape already handled by a dialog on top (the picker) leaves the panel and its focus alone", async () => {
    const user = userEvent.setup();
    seed([PRO]);
    renderWithProviders(<DeviceBar />);

    const toggle = await screen.findByRole("button", {
      name: new RegExp(t.allCategories(3)),
    });
    await user.click(toggle);
    expect(screen.getByRole("region")).toBeInTheDocument();

    // Radix dismisses its layer from a capture listener and marks the event.
    const handled = (event: KeyboardEvent) => event.preventDefault();
    document.addEventListener("keydown", handled, { capture: true });
    try {
      await user.keyboard("{Escape}");
    } finally {
      document.removeEventListener("keydown", handled, { capture: true });
    }
    expect(screen.getByRole("region")).toBeInTheDocument();

    // While the picker is open, its Esc is never the panel's either.
    act(() => openDevicePicker());
    await user.keyboard("{Escape}");
    expect(screen.getByRole("region")).toBeInTheDocument();
    act(() => closeDevicePicker());

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("an outside click closes the panel", async () => {
    const user = userEvent.setup();
    seed([PRO]);
    renderWithProviders(
      <>
        <DeviceBar />
        <button type="button">outside</button>
      </>,
    );

    await user.click(
      await screen.findByRole("button", {
        name: new RegExp(t.allCategories(3)),
      }),
    );
    expect(screen.getByRole("region")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("with no compatible products: a calm line linking the whole catalogue", async () => {
    seed([S24]);
    renderWithProviders(<DeviceBar />);

    const nav = await screen.findByRole("navigation", {
      name: t.categoriesAria(S24.name),
    });
    expect(
      await within(nav).findByRole("link", { name: t.noCategoriesLink }),
    ).toHaveAttribute("href", "/products");
    expect(
      within(nav).queryByRole("button", { name: /Усі категорії/ }),
    ).not.toBeInTheDocument();
  });
});

describe("DeviceBar — server HTML (TASK-2074, no layout shift)", () => {
  function serverHtml(): string {
    const client = new QueryClient();
    return renderToString(
      <QueryClientProvider client={client}>
        <DeviceBar />
      </QueryClientProvider>,
    );
  }

  it("ships a placeholder with the pre-paint script and a tier-2 reservation keyed to it", () => {
    seed([PRO]);
    const html = serverHtml();
    // innerHTML never runs scripts — the markup is only inspected.
    const doc = document.createElement("div");
    doc.innerHTML = html;

    // No personal content: the saved device never reaches the HTML.
    expect(html).not.toContain(PRO.name);
    expect(doc.querySelector("script")?.textContent).toBe(
      RESERVE_TIER_TWO_SCRIPT,
    );

    const reserve = doc.querySelector(
      '[data-slot="device-bar-tier-two-reserve"]',
    );
    expect(reserve).toHaveAttribute("aria-hidden", "true");
    // Hidden by default; shown at lg only under the script's <html> flag.
    expect(reserve?.className).toContain("hidden");
    expect(reserve?.className).toContain(
      `lg:[html[${HAS_DEVICE_ATTR}]_&]:block`,
    );
    // Same box as the real tier 2: 1px border + a 52px row.
    expect(reserve?.className).toContain("border-t");
    expect(reserve?.querySelector(".h-13")).not.toBeNull();
  });
});
