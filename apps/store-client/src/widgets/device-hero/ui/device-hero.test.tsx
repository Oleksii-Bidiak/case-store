import { http, HttpResponse } from "msw";
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
import type { DeviceHubGroupEntity } from "@/shared/api/generated/models";

import { DeviceHero } from "./device-hero";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

const t = dict.devicePicker.hero;
const MODELS_API = "http://localhost:3001/api/device-models";
const HUB_API = "http://localhost:3001/api/catalog/device-hubs/:slug";

function model(
  id: string,
  name: string,
  over: Partial<DeviceModelListItemEntity> = {},
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
    productCount: 10,
    ...over,
  };
}

const samsung = { brandName: "Samsung", brandSlug: "samsung" };

// Popularity order, as `GET /device-models?sort=popular` returns it.
const MODELS: DeviceModelListItemEntity[] = [
  model("iphone-16-pro", "iPhone 16 Pro", { productCount: 96 }),
  model("iphone-15-pro", "iPhone 15 Pro", { productCount: 128 }),
  model("iphone-15", "iPhone 15", { productCount: 142 }),
  model("iphone-13", "iPhone 13", { productCount: 118 }),
  model("galaxy-s24-ultra", "Galaxy S24 Ultra", {
    ...samsung,
    series: "Galaxy S24",
    productCount: 74,
  }),
  model("galaxy-a55", "Galaxy A55", { ...samsung, productCount: 52 }),
  model("iphone-12", "iPhone 12", { productCount: 40 }),
  model("iphone-11", "iPhone 11", { productCount: 20 }),
  model("iphone-xr", "iPhone XR", { productCount: 5 }),
  model("iphone-se", "iPhone SE", { productCount: 3 }),
];

function hubGroup(
  slug: string,
  name: string,
  productCount: number,
  ids: string[],
): DeviceHubGroupEntity {
  return {
    category: { id: `cat-${slug}`, name, slug },
    productCount,
    products: ids.map((id) => ({ id, name: id }) as never),
  };
}

function seedDevices(devices: Array<Partial<MyDevice> & { modelId: string }>) {
  const now = 1_000_000;
  const list: MyDevice[] = devices.map((d, i) => ({
    slug: d.modelId,
    name: d.modelId,
    brandName: "Apple",
    family: "iphone",
    lastUsedAt: now - i,
    ...d,
  }));
  window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, JSON.stringify(list));
}

let hubRequests: string[] = [];

beforeEach(() => {
  window.localStorage.clear();
  mockPush.mockReset();
  hubRequests = [];
  server.use(
    http.get(MODELS_API, () => HttpResponse.json({ data: MODELS })),
    http.get(HUB_API, ({ params }) => {
      hubRequests.push(String(params.slug));
      return HttpResponse.json({
        data: {
          model: { id: params.slug, name: "x", slug: params.slug },
          productCount: 128,
          groups: [
            hubGroup("cables", "Кабелі", 13, ["k1"]),
            hubGroup("cases", "Чохли", 44, ["c1", "c2"]),
            hubGroup("glass", "Захисне скло", 15, ["g1"]),
            hubGroup("chargers", "Зарядні пристрої", 20, ["z1"]),
            hubGroup("holders", "Тримачі", 4, ["h1"]),
          ],
        },
      });
    }),
  );
});

afterEach(() => {
  act(() => closeDevicePicker());
});

describe("DeviceHero — no saved device (TASK-1952)", () => {
  it("asks for the device as the page h1 and shows 7 popular tiles + «Усі моделі»", async () => {
    renderWithProviders(<DeviceHero />);

    expect(
      screen.getByRole("heading", { level: 1, name: t.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: t.sectionAria }),
    ).toBeInTheDocument();

    const tile = await screen.findByRole("link", { name: /iPhone 15 Pro/ });
    expect(tile).toHaveAttribute("href", "/devices/iphone-15-pro");
    expect(tile).toHaveTextContent(
      `Apple · ${dict.devicePicker.productCount(128)}`,
    );

    const hubLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.startsWith("/devices/"));
    expect(hubLinks).toHaveLength(7);
    // Tiles 6–7 are for ≥ 768 only.
    expect(screen.getByRole("link", { name: /Galaxy A55/ })).toHaveClass(
      "hidden",
      "md:flex",
    );
    // The 8th popular model is not a tile.
    expect(
      screen.queryByRole("link", { name: /iPhone 11/ }),
    ).not.toBeInTheDocument();

    const all = screen.getByRole("button", { name: new RegExp(t.allModels) });
    expect(all).toHaveTextContent(t.modelsTotal(MODELS.length));
    expect(t.modelsTotal(MODELS.length)).toBe("Понад 10 моделей");
  });

  it("a tile saves the device as active (its link goes to the hub)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DeviceHero />);

    const tile = await screen.findByRole("link", { name: /Galaxy S24 Ultra/ });
    tile.addEventListener("click", (event) => event.preventDefault());
    await user.click(tile);

    expect(readMyDevices()[0]).toMatchObject({
      modelId: "galaxy-s24-ultra",
      slug: "galaxy-s24-ultra",
      family: "galaxy",
    });
  });

  it("a model without products is saved, not linked — the block flips to its panel", async () => {
    const user = userEvent.setup();
    // A thin catalogue: the zero-count model still fills the grid, last.
    server.use(
      http.get(MODELS_API, () =>
        HttpResponse.json({
          data: [
            model("pixel-9", "Pixel 9", {
              brandName: "Google",
              brandSlug: "google",
              productCount: 0,
            }),
            ...MODELS.slice(0, 3),
          ],
        }),
      ),
    );
    renderWithProviders(<DeviceHero />);

    await user.click(await screen.findByRole("button", { name: /Pixel 9/ }));

    expect(readMyDevices()[0]?.modelId).toBe("pixel-9");
    expect(mockPush).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Pixel 9" }),
    ).toBeInTheDocument();
    expect(screen.getByText(t.noneFit)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.catalogCta })).toHaveAttribute(
      "href",
      "/products",
    );
    expect(hubRequests).toEqual([]);
  });

  it("search suggests models for Cyrillic and typos; Enter takes the first and opens its hub", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DeviceHero />);
    await screen.findByRole("link", { name: /iPhone 15 Pro/ });

    const field = screen.getByRole("combobox", { name: t.searchAria });
    expect(field).toHaveAttribute("aria-expanded", "false");

    await user.type(field, "айфон 15 про");
    const list = screen.getByRole("listbox", { name: t.suggestionsAria });
    const options = within(list).getAllByRole("option");
    expect(options[0]).toHaveTextContent("iPhone 15 Pro");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(field).toHaveAttribute("aria-expanded", "true");
    expect(field).toHaveAttribute("aria-activedescendant", options[0]?.id);
    expect(
      screen.getByText(
        dict.devicePicker.dialog.corrected("айфон 15 про", "iPhone 15 Pro"),
      ),
    ).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(readMyDevices()[0]?.modelId).toBe("iphone-15-pro");
    expect(mockPush).toHaveBeenCalledWith("/devices/iphone-15-pro");
  });

  it("↑/↓ move the highlight, a click picks, Esc closes then clears", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DeviceHero />);
    await screen.findByRole("link", { name: /iPhone 15 Pro/ });
    const field = screen.getByRole("combobox", { name: t.searchAria });

    await user.type(field, "iphnoe");
    let options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(1);
    await user.keyboard("{ArrowDown}");
    options = screen.getAllByRole("option");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(field).toHaveAttribute("aria-activedescendant", options[1]?.id);

    await user.keyboard("{Escape}");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(field).toHaveValue("iphnoe");
    await user.keyboard("{Escape}");
    expect(field).toHaveValue("");

    await user.type(field, "galaxy a55");
    await user.click(screen.getByRole("option", { name: /Galaxy A55/ }));
    expect(readMyDevices()[0]?.modelId).toBe("galaxy-a55");
    expect(mockPush).toHaveBeenCalledWith("/devices/galaxy-a55");
  });

  it("no match → «Знайти» opens the full picker with the query; its choice goes to the hub", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DeviceHero />);
    await screen.findByRole("link", { name: /iPhone 15 Pro/ });

    await user.type(
      screen.getByRole("combobox", { name: t.searchAria }),
      "nokia 3310",
    );
    expect(screen.getByText(t.noMatch)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.searchSubmit }));

    const state = getDevicePickerState();
    expect(state.open).toBe(true);
    expect(state.request.query).toBe("nokia 3310");

    // The picker reports the device it made active → its hub.
    act(() =>
      state.request.onChoose?.({
        modelId: "iphone-13",
        slug: "iphone-13",
        name: "iPhone 13",
        brandName: "Apple",
        family: "iphone",
        lastUsedAt: 1,
      }),
    );
    expect(mockPush).toHaveBeenCalledWith("/devices/iphone-13");
  });

  it("«Усі моделі» and an empty «Знайти» open the picker without a query", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DeviceHero />);

    await user.click(
      await screen.findByRole("button", { name: new RegExp(t.allModels) }),
    );
    expect(getDevicePickerState().open).toBe(true);
    expect(getDevicePickerState().request.query).toBeUndefined();

    act(() => closeDevicePicker());
    await user.click(screen.getByRole("button", { name: t.searchSubmit }));
    expect(getDevicePickerState().open).toBe(true);
    expect(getDevicePickerState().request.query).toBeUndefined();
  });

  it("shows a retry when the model list fails to load", async () => {
    server.use(
      http.get(MODELS_API, () => new HttpResponse(null, { status: 500 })),
    );
    renderWithProviders(<DeviceHero />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.devicePicker.dialog.loadError,
    );
  });
});

describe("DeviceHero — a device is saved (TASK-1952)", () => {
  it("shows the active device's panel: h1, count, hub CTA, biggest categories, picks", async () => {
    seedDevices([
      { modelId: "iphone-15-pro", name: "iPhone 15 Pro" },
      {
        modelId: "galaxy-a55",
        name: "Galaxy A55",
        family: "galaxy",
        label: "Мама",
      },
    ]);
    const renderPicks = jest.fn(({ products }) => (
      <p>picks: {products.map((p: { id: string }) => p.id).join(",")}</p>
    ));
    renderWithProviders(<DeviceHero renderPicks={renderPicks} />);

    expect(
      screen.getByRole("region", { name: t.panelAria("iPhone 15 Pro") }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "iPhone 15 Pro" }),
    ).toBeInTheDocument();
    expect(screen.getByText(t.kicker)).toBeInTheDocument();
    expect(
      await screen.findByText(t.fits(dict.devicePicker.productCount(128))),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: t.cta("iPhone 15 Pro") }),
    ).toHaveAttribute("href", "/devices/iphone-15-pro");

    const nav = await screen.findByRole("navigation", {
      name: t.categoriesAria("iPhone 15 Pro"),
    });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "Чохли44",
      "Зарядні пристрої20",
      "Захисне скло15",
      "Кабелі13",
    ]);
    expect(links[0]).toHaveAttribute("href", "/catalog/cases/iphone-15-pro");

    expect(await screen.findByText("picks: c1,z1,g1")).toBeInTheDocument();
    expect(hubRequests).toEqual(["iphone-15-pro"]);
    // The picker's h1 is gone — one h1 per page.
    expect(
      screen.queryByRole("heading", { name: t.title }),
    ).not.toBeInTheDocument();
  });

  it("switches to another saved device in one tap and opens the picker for a new one", async () => {
    const user = userEvent.setup();
    seedDevices([
      { modelId: "iphone-15-pro", name: "iPhone 15 Pro" },
      {
        modelId: "galaxy-a55",
        name: "Galaxy A55",
        family: "galaxy",
        label: "Мама",
      },
    ]);
    renderWithProviders(<DeviceHero />);

    expect(screen.getByText(t.alsoYours)).toBeInTheDocument();
    const other = screen.getByRole("button", {
      name: t.showFor("Galaxy A55", "Мама"),
    });
    expect(other).toHaveTextContent("Galaxy A55 · Мама");
    await user.click(other);

    expect(readMyDevices()[0]?.modelId).toBe("galaxy-a55");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Galaxy A55" }),
    ).toBeInTheDocument();
    expect(screen.getByText(t.kickerLabel("Мама"))).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: t.otherDevice }));
    expect(getDevicePickerState().open).toBe(true);
    expect(typeof getDevicePickerState().request.onChoose).toBe("function");
  });

  it("with one device there is no «Також у вас:»", () => {
    seedDevices([{ modelId: "iphone-13", name: "iPhone 13" }]);
    renderWithProviders(<DeviceHero />);
    expect(screen.queryByText(t.alsoYours)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: t.otherDevice }),
    ).toBeInTheDocument();
  });
});

describe("DeviceHero — copy", () => {
  it("rounds the model total down to tens and says the exact number below ten", () => {
    expect(t.modelsTotal(47)).toBe("Понад 40 моделей");
    expect(t.modelsTotal(3)).toBe("3 моделі");
    expect(t.modelsTotal(1)).toBe("1 модель");
    expect(t.modelsTotal(5)).toBe("5 моделей");
  });
});

it("waits for nothing it does not need: no hub request without a device", async () => {
  renderWithProviders(<DeviceHero />);
  await screen.findByRole("link", { name: /iPhone 15 Pro/ });
  await waitFor(() => expect(hubRequests).toEqual([]));
});
