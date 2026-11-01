import { http, HttpResponse } from "msw";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import {
  MY_DEVICES_STORAGE_KEY,
  closeDevicePicker,
  getDevicePickerState,
  type MyDevice,
} from "@/entities/my-devices";
import { FooterDeviceRow } from "./footer-device-row";

const t = dict.footer.device;

function device(slug: string, name: string): MyDevice {
  return {
    modelId: `id-${slug}`,
    slug,
    name,
    brandName: "Apple",
    family: "iphone",
    lastUsedAt: 0,
  };
}

/** Saves devices most-recent first (the first is active). */
function seed(devices: MyDevice[]): void {
  window.localStorage.setItem(
    MY_DEVICES_STORAGE_KEY,
    JSON.stringify(devices.map((d, i) => ({ ...d, lastUsedAt: 1_000 - i }))),
  );
}

function mockModels(productCount: number): void {
  server.use(
    http.get("*/api/device-models", () =>
      HttpResponse.json({
        data: [
          {
            id: "id-iphone-15-pro",
            slug: "iphone-15-pro",
            name: "iPhone 15 Pro",
            productCount,
          },
        ],
        meta: { total: 1 },
      }),
    ),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  closeDevicePicker();
});

describe("FooterDeviceRow (TASK-2078)", () => {
  it("renders nothing personal on the server — an invisible, unfocusable placeholder", () => {
    seed([device("iphone-15-pro", "iPhone 15 Pro")]);
    const html = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <FooterDeviceRow />
      </QueryClientProvider>,
    );
    expect(html).not.toContain("iPhone 15 Pro");
    expect(html).toContain("invisible");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('tabindex="-1"');
  });

  it("without a device asks to choose one and opens the site-wide picker", async () => {
    renderWithProviders(<FooterDeviceRow />);

    expect(screen.getByRole("group", { name: t.aria })).toHaveTextContent(
      t.emptyLead,
    );
    await userEvent.click(screen.getByRole("button", { name: t.choose }));
    expect(getDevicePickerState().open).toBe(true);
  });

  it("with devices links the active one's hub and counts the others", async () => {
    mockModels(42);
    seed([
      device("iphone-15-pro", "iPhone 15 Pro"),
      device("iphone-13", "iPhone 13"),
      device("iphone-12", "iPhone 12"),
    ]);
    renderWithProviders(<FooterDeviceRow />);

    const row = screen.getByRole("group", { name: t.aria });
    expect(row).toHaveTextContent(`${t.activeLead} iPhone 15 Pro${t.more(2)}`);
    expect(
      screen.getByRole("link", { name: t.hubCta("iPhone 15 Pro") }),
    ).toHaveAttribute("href", "/devices/iphone-15-pro");
    expect(screen.getByRole("link", { name: t.myDevices })).toHaveAttribute(
      "href",
      "/devices",
    );
    expect(
      screen.queryByRole("button", { name: t.choose }),
    ).not.toBeInTheDocument();
  });

  it("says nothing about others when only one device is saved", () => {
    mockModels(42);
    seed([device("iphone-15-pro", "iPhone 15 Pro")]);
    renderWithProviders(<FooterDeviceRow />);

    expect(screen.getByRole("group", { name: t.aria })).not.toHaveTextContent(
      "у списку",
    );
  });

  it("drops the hub link once the model is known to have no goods (the hub 404s)", async () => {
    mockModels(0);
    seed([device("iphone-15-pro", "iPhone 15 Pro")]);
    renderWithProviders(<FooterDeviceRow />);

    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: t.hubCta("iPhone 15 Pro") }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: t.myDevices })).toBeInTheDocument();
  });
});
