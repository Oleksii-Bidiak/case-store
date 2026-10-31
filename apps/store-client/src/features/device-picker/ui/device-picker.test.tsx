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
  openDevicePicker,
  readMyDevices,
  type MyDevice,
} from "@/entities/my-devices";
import { DevicePicker } from "./device-picker";

const t = dict.devicePicker.dialog;
const API = "http://localhost:3001/api/device-models";

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

// Popularity order, as `GET /device-models?sort=popular` returns it.
const MODELS: DeviceModelListItemEntity[] = [
  model("iphone-16-pro", "iPhone 16 Pro", {
    series: "iPhone 16",
    releaseYear: 2024,
    productCount: 140,
  }),
  model("iphone-15-pro", "iPhone 15 Pro", {
    series: "iPhone 15",
    productCount: 128,
  }),
  model("iphone-15", "iPhone 15", { series: "iPhone 15", productCount: 96 }),
  model("galaxy-s24-ultra", "Galaxy S24 Ultra", {
    series: "Galaxy S24",
    brandName: "Samsung",
    brandSlug: "samsung",
    productCount: 52,
  }),
  model("galaxy-a55", "Galaxy A55", {
    series: "Galaxy A",
    brandName: "Samsung",
    brandSlug: "samsung",
    productCount: 31,
  }),
];

let requestedParams: URLSearchParams | null = null;

function seedDevices(names: string[]): void {
  const now = 1_000_000;
  const devices: MyDevice[] = names.map((name, i) => ({
    modelId: `saved-${i}`,
    slug: `saved-${i}`,
    name,
    brandName: "Apple",
    family: "iphone",
    lastUsedAt: now - i,
  }));
  window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, JSON.stringify(devices));
}

async function openPicker(request?: Parameters<typeof openDevicePicker>[0]) {
  act(() => openDevicePicker(request));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  window.localStorage.clear();
  requestedParams = null;
  server.use(
    http.get(API, ({ request }) => {
      requestedParams = new URL(request.url).searchParams;
      return HttpResponse.json({ data: MODELS });
    }),
  );
});

afterEach(() => {
  act(() => closeDevicePicker());
});

describe("DevicePicker (TASK-2070)", () => {
  it("renders nothing and fetches nothing until opened", () => {
    renderWithProviders(<DevicePicker />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(requestedParams).toBeNull();
  });

  it("with no devices: asks for one, loads popular models once, and a tile applies at once", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DevicePicker />);
    const dialog = await openPicker();

    expect(
      within(dialog).getByRole("heading", { name: t.titleEmpty }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("group", { name: t.savedGroupAria }),
    ).not.toBeInTheDocument();

    const tile = await within(dialog).findByRole("button", {
      name: /iPhone 15 Pro/,
    });
    expect(requestedParams?.get("sort")).toBe("popular");
    expect(requestedParams?.get("limit")).toBe("200");
    expect(tile).toHaveTextContent(dict.devicePicker.productCount(128));

    await user.click(tile);

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(readMyDevices()[0]).toMatchObject({
      modelId: "iphone-15-pro",
      slug: "iphone-15-pro",
      name: "iPhone 15 Pro",
      family: "iphone",
    });
  });

  it("family tabs list the family's models grouped by series", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DevicePicker />);
    const dialog = await openPicker();

    const tablist = await within(dialog).findByRole("tablist", {
      name: t.familiesAria,
    });
    // Only families with models get a tab.
    expect(
      within(tablist)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual([t.popular, t.families.iphone, t.families.galaxy]);

    await user.click(within(tablist).getByRole("tab", { name: "Galaxy" }));

    expect(
      within(dialog).getByRole("heading", { name: "Galaxy S24" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Galaxy A55" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "iPhone 15" }),
    ).not.toBeInTheDocument();
  });

  it("opens on a preset family tab", async () => {
    renderWithProviders(<DevicePicker />);
    const dialog = await openPicker({ family: "galaxy" });
    expect(
      await within(dialog).findByRole("tab", { name: "Galaxy" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("search tolerates Cyrillic and typos, says so, and Enter picks the top hit", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DevicePicker />);
    const dialog = await openPicker();
    await within(dialog).findByRole("tab", { name: t.popular });

    const field = within(dialog).getByRole("searchbox", { name: t.searchAria });
    await user.type(field, "айфон 15 про");

    expect(
      within(dialog).getByText(t.corrected("айфон 15 про", "iPhone 15 Pro")),
    ).toBeInTheDocument();
    const results = within(dialog).getByRole("list", { name: t.resultsAria });
    expect(within(results).getAllByRole("button")[0]).toHaveTextContent(
      "iPhone 15 Pro",
    );
    // Results mode hides the tabs.
    expect(within(dialog).queryByRole("tablist")).not.toBeInTheDocument();

    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(readMyDevices()[0]?.modelId).toBe("iphone-15-pro");
  });

  it("an unknown model shows the empty state; clearing the field brings the tabs back", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DevicePicker />);
    const dialog = await openPicker({ query: "nokia 3310" });

    expect(await within(dialog).findByText(t.emptyTitle)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: t.emptyBodyLink }),
    ).toHaveAttribute("href", "/contact");

    await user.click(
      within(dialog).getByRole("button", { name: t.clearSearch }),
    );
    expect(within(dialog).getByRole("searchbox")).toHaveValue("");
    expect(within(dialog).getByRole("tablist")).toBeInTheDocument();
  });

  it("with saved devices: leads with them, 6 then «Показати всі», tap makes active", async () => {
    const user = userEvent.setup();
    seedDevices([
      "iPhone 15 Pro",
      "iPhone 13",
      "iPad Air",
      "Galaxy S24",
      "Watch S10",
      "iPhone 12",
      "iPhone 11",
      "iPhone XR",
    ]);
    renderWithProviders(<DevicePicker />);
    const dialog = await openPicker();

    expect(
      within(dialog).getByRole("heading", { name: t.titleSaved(8) }),
    ).toBeInTheDocument();
    const group = within(dialog).getByRole("group", { name: t.savedGroupAria });
    const rows = () =>
      within(group).getAllByRole("button", { pressed: false }).length +
      within(group).getAllByRole("button", { pressed: true }).length;
    expect(rows()).toBe(6);
    expect(
      within(group).getByRole("button", { pressed: true }),
    ).toHaveTextContent("iPhone 15 Pro");
    expect(
      within(dialog).getByRole("link", { name: t.manage }),
    ).toHaveAttribute("href", "/devices");

    await user.click(
      within(dialog).getByRole("button", { name: t.showAll(8) }),
    );
    expect(rows()).toBe(8);
    expect(
      within(dialog).getByRole("button", { name: t.collapse }),
    ).toHaveAttribute("aria-expanded", "true");

    await user.click(within(group).getByRole("button", { name: /^iPhone 13/ }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(readMyDevices()[0]?.name).toBe("iPhone 13");
    expect(readMyDevices()).toHaveLength(8);
  });

  it("✕ forgets a device and keeps the picker open; the next one becomes active", async () => {
    const user = userEvent.setup();
    seedDevices(["iPhone 15 Pro", "iPhone 13"]);
    renderWithProviders(<DevicePicker />);
    const dialog = await openPicker();

    await user.click(
      within(dialog).getByRole("button", { name: t.forget("iPhone 15 Pro") }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: t.titleSaved(1) }),
    ).toBeInTheDocument();
    expect(readMyDevices().map((d) => d.name)).toEqual(["iPhone 13"]);
    expect(
      within(dialog).getByText(t.forgotten("iPhone 15 Pro")),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("searchbox")).toHaveFocus();
  });

  it("«Забути всі пристрої» asks once more, then clears the list", async () => {
    const user = userEvent.setup();
    seedDevices(["iPhone 15 Pro", "iPhone 13"]);
    renderWithProviders(<DevicePicker />);
    const dialog = await openPicker();

    await user.click(within(dialog).getByRole("button", { name: t.forgetAll }));
    expect(readMyDevices()).toHaveLength(2);
    const confirm = within(dialog).getByRole("button", {
      name: t.forgetAllConfirm(2),
    });
    expect(confirm).toHaveFocus();

    await user.click(confirm);
    expect(readMyDevices()).toHaveLength(0);
    expect(
      within(dialog).getByRole("heading", { name: t.titleEmpty }),
    ).toBeInTheDocument();
  });

  it("«Як дізнатися свою модель?» toggles the help", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DevicePicker />);
    const dialog = await openPicker();

    const toggle = within(dialog).getByRole("button", { name: t.helpToggle });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByText(t.help[0].lead)).toBeInTheDocument();
  });

  it("Escape closes it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DevicePicker />);
    await openPicker();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("shows a retry when the model list fails to load", async () => {
    server.use(http.get(API, () => HttpResponse.json({}, { status: 500 })));
    renderWithProviders(<DevicePicker />);
    const dialog = await openPicker();
    expect(await within(dialog).findByText(t.loadError)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: t.retry }),
    ).toBeInTheDocument();
  });
});
