/**
 * TASK-2077 — the device chip above the grid and the «nothing fits your
 * device» empty state, both read from the one `?device=` param.
 */
import { act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import {
  addDevice,
  clearMyDevices,
  readMyDevices,
  type MyDeviceInput,
} from "@/entities/my-devices";
import { ActiveFilterChips } from "./active-filter-chips";
import { MyDevicesEmptyState } from "./my-devices-empty-state";

const t = dict.filters.myDevices;

const thirteen: MyDeviceInput = {
  modelId: "m-13",
  slug: "iphone-13",
  name: "iPhone 13",
  brandName: "Apple",
  family: "iphone",
  label: "Мама",
};
const galaxy: MyDeviceInput = {
  modelId: "m-s24",
  slug: "galaxy-s24",
  name: "Galaxy S24",
  brandName: "Samsung",
  family: "galaxy",
};

const TOTALS: Record<string, number> = { "": 34, "iphone-13": 5 };

beforeEach(() => {
  window.localStorage.clear();
  clearMyDevices();
  server.use(
    http.get("*/api/device-models", () =>
      HttpResponse.json({
        data: [
          { id: "m-13", slug: "iphone-13", name: "iPhone 13" },
          { id: "m-s24", slug: "galaxy-s24", name: "Galaxy S24" },
        ],
      }),
    ),
    http.get("*/api/products", ({ request }) => {
      const device = new URL(request.url).searchParams.get("device") ?? "";
      return HttpResponse.json({
        data: [],
        meta: { total: TOTALS[device] ?? 0, page: 1, limit: 1, totalPages: 1 },
      });
    }),
  );
});

describe("ActiveFilterChips — device chip", () => {
  it("names the active saved device and removes the device filter", async () => {
    act(() => addDevice(thirteen));
    const onFilterChange = jest.fn();
    renderWithProviders(
      <ActiveFilterChips
        currentParams={{ device: "iphone-13" }}
        onFilterChange={onFilterChange}
      />,
    );

    const chip = await screen.findByRole("button", {
      name: `${t.chipFor("iPhone 13 · Мама")} — ${t.chipRemoveAria}`,
    });
    await userEvent.click(chip);
    expect(onFilterChange).toHaveBeenCalledWith({ device: undefined });
  });

  it("reads «Для всіх моїх · n» for every saved slug", async () => {
    act(() => {
      addDevice(thirteen);
      addDevice(galaxy);
    });
    renderWithProviders(
      <ActiveFilterChips
        currentParams={{ device: "galaxy-s24,iphone-13" }}
        onFilterChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", {
        name: `${t.chipAll(2)} — ${t.chipRemoveAria}`,
      }),
    ).toBeInTheDocument();
  });

  it("names the models of a shared several-device link with no saved devices", async () => {
    renderWithProviders(
      <ActiveFilterChips
        currentParams={{ device: "iphone-13,galaxy-s24" }}
        onFilterChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByText(t.chipOther("iPhone 13, Galaxy S24")),
    ).toBeInTheDocument();
  });
});

describe("MyDevicesEmptyState", () => {
  it("explains the empty listing and offers the hub, all products and other devices", async () => {
    act(() => {
      addDevice(thirteen);
      addDevice(galaxy); // active
    });
    const devices = readMyDevices();
    const onFilterChange = jest.fn();
    renderWithProviders(
      <MyDevicesEmptyState
        device={devices[0]}
        devices={devices}
        currentParams={{ category: "chohly", device: "galaxy-s24" }}
        categoryName="Чохли"
        onFilterChange={onFilterChange}
      />,
    );

    expect(screen.getByText(t.emptyHeading("Galaxy S24"))).toBeInTheDocument();
    expect(
      await screen.findByText(t.emptyBody("Galaxy S24", 34, "Чохли")),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: t.emptyHub("Galaxy S24") }),
    ).toHaveAttribute("href", "/devices/galaxy-s24");

    const other = await screen.findByRole("button", {
      name: t.emptyOtherDevice("iPhone 13 · Мама", 5),
    });
    await userEvent.click(other);
    expect(onFilterChange).toHaveBeenCalledWith({ device: "iphone-13" });
    expect(readMyDevices()[0].slug).toBe("iphone-13");

    await userEvent.click(
      screen.getByRole("button", { name: t.emptyShowAll(34) }),
    );
    expect(onFilterChange).toHaveBeenCalledWith({ device: undefined });
  });
});
