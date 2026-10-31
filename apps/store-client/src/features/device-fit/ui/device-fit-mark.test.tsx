/**
 * DeviceFitMark (TASK-1953): the «Підходить до / Не для» pill on cards.
 */
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import { addDevice, clearMyDevices } from "@/entities/my-devices";
import { dict } from "@/shared/config";

import { DeviceFitMark } from "./device-fit-mark";

const iphone15Pro = {
  modelId: "m-15pro",
  slug: "iphone-15-pro",
  name: "iPhone 15 Pro",
  brandName: "Apple",
  family: "iphone" as const,
};
const galaxyS24 = {
  modelId: "m-s24",
  slug: "galaxy-s24",
  name: "Galaxy S24",
  brandName: "Samsung",
  family: "galaxy" as const,
};

beforeEach(() => {
  window.localStorage.clear();
  clearMyDevices();
});

describe("DeviceFitMark", () => {
  it("says «Підходить до …» in the success tone when the active device fits", () => {
    addDevice(iphone15Pro);
    render(<DeviceFitMark compatibleDeviceModelIds={["m-15pro", "m-15"]} />);
    const mark = screen.getByText(dict.deviceFit.fits("iPhone 15 Pro"));
    const pill = mark.closest("[data-slot='device-fit-mark']");
    expect(pill).toHaveAttribute("data-verdict", "fits");
    expect(pill).toHaveClass("text-success");
    expect(pill).toHaveAttribute("title", dict.deviceFit.fits("iPhone 15 Pro"));
  });

  it("says «Не для …» in a neutral tone — never an alarm colour — when it does not fit", () => {
    addDevice(galaxyS24);
    render(<DeviceFitMark compatibleDeviceModelIds={["m-15pro"]} />);
    const pill = screen
      .getByText(dict.deviceFit.notFor("Galaxy S24"))
      .closest("[data-slot='device-fit-mark']");
    expect(pill).toHaveAttribute("data-verdict", "no-fit");
    expect(pill).toHaveClass("bg-muted", "text-muted-foreground");
    expect(pill?.className).not.toMatch(/destructive|sale|warning/);
  });

  it("renders nothing without a saved device", () => {
    const { container } = render(
      <DeviceFitMark compatibleDeviceModelIds={["m-15pro"]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a product without compatibility data, even with reserveSpace", () => {
    addDevice(iphone15Pro);
    const { container } = render(
      <DeviceFitMark compatibleDeviceModelIds={[]} reserveSpace />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps an aria-hidden one-line slot when asked to reserve space and there is no verdict", () => {
    const { container } = render(
      <DeviceFitMark compatibleDeviceModelIds={["m-15pro"]} reserveSpace />,
    );
    const slot = container.querySelector(
      "[data-slot='device-fit-placeholder']",
    );
    expect(slot).toHaveAttribute("aria-hidden", "true");
    expect(slot).toHaveClass("h-6");
  });

  it("renders no verdict on the server, even with a saved device", () => {
    addDevice(iphone15Pro);
    const html = renderToString(
      <DeviceFitMark compatibleDeviceModelIds={["m-15pro"]} reserveSpace />,
    );
    expect(html).not.toContain(dict.deviceFit.fits("iPhone 15 Pro"));
    expect(html).toContain("device-fit-placeholder");
  });

  it("updates live when the active device changes", () => {
    addDevice(iphone15Pro);
    render(<DeviceFitMark compatibleDeviceModelIds={["m-15pro"]} />);
    expect(
      screen.getByText(dict.deviceFit.fits("iPhone 15 Pro")),
    ).toBeInTheDocument();
    act(() => {
      addDevice(galaxyS24);
    });
    expect(
      screen.getByText(dict.deviceFit.notFor("Galaxy S24")),
    ).toBeInTheDocument();
  });

  it("truncates to one line in the list-row layout", () => {
    addDevice(iphone15Pro);
    render(
      <DeviceFitMark
        compatibleDeviceModelIds={["m-15pro"]}
        layout="truncate"
      />,
    );
    expect(screen.getByText(dict.deviceFit.fits("iPhone 15 Pro"))).toHaveClass(
      "truncate",
    );
  });
});
