/**
 * MobileAtcBar — the compact compatibility verdict under the price (Д3-2
 * Product §6.7).
 */
import { act } from "@testing-library/react";

import { addDevice, clearMyDevices } from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { renderWithProviders, screen } from "@/shared/test/render";

import { MobileAtcBar } from "./mobile-atc-bar";

const props = {
  productId: "p-1",
  productName: "Clear Case",
  price: "999",
  inStock: true,
  inCart: false,
  onOpenCart: () => {},
};

const watch = {
  modelId: "m-w10",
  slug: "apple-watch-series-10-46",
  name: "Apple Watch Series 10 46 мм",
  brandName: "Apple",
  family: "watch" as const,
};

beforeEach(() => {
  window.localStorage.clear();
  clearMyDevices();
});

describe("MobileAtcBar", () => {
  it("says the product fits the active device, by its short name, in success", () => {
    addDevice(watch);
    renderWithProviders(
      <MobileAtcBar {...props} compatibleDeviceModelIds={["m-w10"]} />,
    );
    const line = screen.getByText(dict.deviceFit.fits("Watch S10 46 мм"));
    expect(line.closest("small")).toHaveClass("text-success");
  });

  it("says «Не для …» in the neutral tone when it does not fit", () => {
    addDevice(watch);
    renderWithProviders(
      <MobileAtcBar {...props} compatibleDeviceModelIds={["m-other"]} />,
    );
    const line = screen.getByText(dict.deviceFit.notFor("Watch S10 46 мм"));
    expect(line.closest("small")).toHaveClass("text-muted-foreground");
    expect(line.closest("small")?.className).not.toMatch(
      /destructive|sale|warning/,
    );
  });

  it("shows no verdict without a saved device or without compatibility data", () => {
    const { container, unmount } = renderWithProviders(
      <MobileAtcBar {...props} compatibleDeviceModelIds={["m-w10"]} />,
    );
    expect(container.querySelector('[data-slot="mobile-atc-fit"]')).toBeNull();
    unmount();

    act(() => {
      addDevice(watch);
    });
    const second = renderWithProviders(<MobileAtcBar {...props} />);
    expect(
      second.container.querySelector('[data-slot="mobile-atc-fit"]'),
    ).toBeNull();
  });

  it("offers the outline «Повідомити»-style CTA for a sold-out position, not a grey disabled «Купити»", () => {
    renderWithProviders(<MobileAtcBar {...props} inStock={false} />);
    expect(
      screen.queryByRole("button", { name: dict.addToCart.buy }),
    ).toBeNull();
  });
});
