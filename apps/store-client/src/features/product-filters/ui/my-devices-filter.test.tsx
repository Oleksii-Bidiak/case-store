/**
 * TASK-2077 — «З урахуванням моїх пристроїв» in the filter rail, rendered
 * through ProductFilters (`withMyDevices`) so the cascade hand-off is covered.
 */
import { act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { ProductControllerFindAllParams } from "@/entities/product";
import {
  addDevice,
  clearMyDevices,
  getDevicePickerState,
  readMyDevices,
  type MyDeviceInput,
} from "@/entities/my-devices";
import { ProductFilters } from "./product-filters";

const t = dict.filters.myDevices;

const thirteen: MyDeviceInput = {
  modelId: "m-13",
  slug: "iphone-13",
  name: "iPhone 13",
  brandName: "Apple",
  family: "iphone",
  label: "Мама",
};
const pro: MyDeviceInput = {
  modelId: "m-15p",
  slug: "iphone-15-pro",
  name: "iPhone 15 Pro",
  brandName: "Apple",
  family: "iphone",
};

// Products per `device=` value, for the radios' counts.
const TOTALS: Record<string, number> = {
  "iphone-15-pro": 12,
  "iphone-13": 7,
  "iphone-15-pro,iphone-13": 15,
};

beforeEach(() => {
  window.localStorage.clear();
  clearMyDevices();
  server.use(
    http.get("*/api/brands", () => HttpResponse.json({ data: [] })),
    http.get("*/api/device-brands", () => HttpResponse.json({ data: [] })),
    http.get("*/api/device-models", () => HttpResponse.json({ data: [] })),
    http.get("*/api/products", ({ request }) => {
      const device = new URL(request.url).searchParams.get("device") ?? "";
      return HttpResponse.json({
        data: [],
        meta: { total: TOTALS[device] ?? 0, page: 1, limit: 1, totalPages: 1 },
      });
    }),
  );
});

function renderRail(
  params: ProductControllerFindAllParams = {},
  onFilterChange = jest.fn(),
) {
  renderWithProviders(
    <ProductFilters
      currentParams={params}
      onFilterChange={onFilterChange}
      withMyDevices
    />,
  );
  return onFilterChange;
}

describe("MyDevicesFilter", () => {
  it("without a saved device offers the picker instead of a switch", async () => {
    renderRail();

    const pick = await screen.findByRole("button", { name: t.pickDevice });
    expect(screen.getByText(t.subtitleNoDevice)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();

    await userEvent.click(pick);
    expect(getDevicePickerState().open).toBe(true);
  });

  it("is off by default and switches on to the active device", async () => {
    act(() => {
      addDevice(thirteen);
      addDevice(pro); // most recent → active
    });
    const onFilterChange = renderRail();

    const toggle = await screen.findByRole("switch", { name: t.title });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(t.offNote("iPhone 15 Pro"))).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(onFilterChange).toHaveBeenCalledWith({ device: "iphone-15-pro" });
  });

  it("when on, lists the saved devices with counts and hides the cascade", async () => {
    act(() => {
      addDevice(thirteen);
      addDevice(pro);
    });
    renderRail({ device: "iphone-15-pro" });

    expect(await screen.findByRole("switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText(t.subtitleActive)).toBeInTheDocument();
    const group = screen.getByRole("radiogroup", { name: t.radiogroupAria });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /iPhone 15 Pro/ })).toBeChecked();
    expect(
      await screen.findByRole("radio", {
        name: new RegExp(`iPhone 13 · Мама.*${t.countAria(7)}`),
      }),
    ).not.toBeChecked();
    expect(
      await screen.findByRole("radio", {
        name: new RegExp(`${t.allDevices(2)}.*${t.countAria(15)}`),
      }),
    ).toBeInTheDocument();
    // One control per param: the brand → model cascade steps aside.
    expect(
      screen.queryByText(dict.filters.deviceTitle),
    ).not.toBeInTheDocument();
  });

  it("picking another device makes it active and filters by it", async () => {
    act(() => {
      addDevice(thirteen);
      addDevice(pro);
    });
    const onFilterChange = renderRail({ device: "iphone-15-pro" });

    await userEvent.click(
      await screen.findByRole("radio", { name: /iPhone 13 · Мама/ }),
    );
    expect(onFilterChange).toHaveBeenCalledWith({ device: "iphone-13" });
    expect(readMyDevices()[0].slug).toBe("iphone-13");
  });

  it("«Для всіх моїх» writes every saved slug, most recent first", async () => {
    act(() => {
      addDevice(thirteen);
      addDevice(pro);
    });
    const onFilterChange = renderRail({ device: "iphone-15-pro" });

    await userEvent.click(
      await screen.findByRole("radio", { name: new RegExp(t.allDevices(2)) }),
    );
    expect(onFilterChange).toHaveBeenCalledWith({
      device: "iphone-15-pro,iphone-13",
    });
  });

  it("reads a several-slug link of saved devices as «all» and switches off", async () => {
    act(() => {
      addDevice(thirteen);
      addDevice(pro);
    });
    const onFilterChange = renderRail({ device: "iphone-15-pro,iphone-13" });

    expect(await screen.findByText(t.subtitleAll)).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: new RegExp(t.allDevices(2)) }),
    ).toBeChecked();

    await userEvent.click(screen.getByRole("switch"));
    expect(onFilterChange).toHaveBeenCalledWith({ device: undefined });
  });

  it("keeps the cascade for a device the saved list does not explain", async () => {
    act(() => addDevice(pro));
    renderRail({ device: "galaxy-s24" });

    expect(await screen.findByRole("switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByText(dict.filters.deviceTitle)).toBeInTheDocument();
  });
});
