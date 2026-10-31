/**
 * DeviceFitMark (TASK-1953): the «Підходить до / Не для» pill on cards.
 */
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import { addDevice, clearMyDevices, setLabel } from "@/entities/my-devices";
import { dict } from "@/shared/config";

import { DeviceFitScopeProvider } from "../model/fit-scope";
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

  it("keeps an empty, aria-hidden two-line slot when asked to reserve space and there is no verdict", () => {
    const { container } = render(
      <DeviceFitMark compatibleDeviceModelIds={["m-15pro"]} reserveSpace />,
    );
    const slot = container.querySelector("[data-slot='device-fit-slot']");
    expect(slot).toHaveAttribute("aria-hidden", "true");
    expect(slot).toHaveClass("h-9.5");
    expect(slot).toBeEmptyDOMElement();
  });

  it("puts the mark INSIDE the same fixed-height slot, clamped to two lines, so it cannot grow the card", () => {
    addDevice(iphone15Pro);
    const { container } = render(
      <DeviceFitMark compatibleDeviceModelIds={["m-15pro"]} reserveSpace />,
    );
    const slot = container.querySelector("[data-slot='device-fit-slot']");
    expect(slot).toHaveClass("h-9.5");
    expect(slot).not.toHaveAttribute("aria-hidden");
    const text = screen.getByText(dict.deviceFit.fits("iPhone 15 Pro"));
    expect(text).toHaveClass("line-clamp-2");
    expect(slot).toContainElement(text);
  });

  it("reserves one line in the list-row layout", () => {
    const { container } = render(
      <DeviceFitMark
        compatibleDeviceModelIds={["m-15pro"]}
        layout="truncate"
        reserveSpace
      />,
    );
    expect(
      container.querySelector("[data-slot='device-fit-slot']"),
    ).toHaveClass("h-6");
  });

  it("uses the short model name on the card («Watch S10 46mm»), the full one in title too", () => {
    addDevice({
      modelId: "m-w10",
      slug: "apple-watch-series-10-46mm",
      name: "Apple Watch Series 10 46mm",
      brandName: "Apple",
      family: "watch" as const,
    });
    render(<DeviceFitMark compatibleDeviceModelIds={["m-w10"]} />);
    const pill = screen
      .getByText(dict.deviceFit.fits("Watch S10 46mm"))
      .closest("[data-slot='device-fit-mark']");
    expect(pill).toHaveAttribute(
      "title",
      dict.deviceFit.fits("Watch S10 46mm"),
    );
  });

  it("renders no verdict on the server, even with a saved device, but the same slot", () => {
    addDevice(iphone15Pro);
    const html = renderToString(
      <DeviceFitMark compatibleDeviceModelIds={["m-15pro"]} reserveSpace />,
    );
    expect(html).not.toContain(dict.deviceFit.fits("iPhone 15 Pro"));
    expect(html).toContain("device-fit-slot");
    expect(html).toContain("h-9.5");
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

describe("DeviceFitMark — mode B, «для всіх моїх» (Catalog mockup §2.3)", () => {
  const renderAll = (ids: string[]) =>
    render(
      <DeviceFitScopeProvider scope="all">
        <DeviceFitMark compatibleDeviceModelIds={ids} />
      </DeviceFitScopeProvider>,
    );

  it("lists every saved device the product fits, with its label", () => {
    addDevice(iphone15Pro);
    setLabel("m-15pro", "Мама");
    addDevice(galaxyS24);
    // Fits the second device only — mode A would say «Не для Galaxy S24».
    renderAll(["m-15pro"]);
    const pill = screen
      .getByText(dict.deviceFit.fitsAny(["iPhone 15 Pro · Мама"]))
      .closest("[data-slot='device-fit-mark']");
    expect(pill).toHaveAttribute("data-mode", "all");
    expect(pill).toHaveAttribute("data-verdict", "fits");
  });

  it("says «Не для ваших пристроїв» when none of them fits", () => {
    addDevice(iphone15Pro);
    addDevice(galaxyS24);
    renderAll(["m-other"]);
    expect(screen.getByText(dict.deviceFit.notForAny)).toHaveClass(
      "line-clamp-2",
    );
  });

  it("falls back to mode A with a single saved device", () => {
    addDevice(galaxyS24);
    renderAll(["m-15pro"]);
    expect(
      screen.getByText(dict.deviceFit.notFor("Galaxy S24")),
    ).toBeInTheDocument();
  });
});
