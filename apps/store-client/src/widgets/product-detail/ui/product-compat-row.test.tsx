/**
 * ProductCompatRow (TASK-1953): the PDP's big «підходить / не підходить» row.
 */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";

import {
  addDevice,
  clearMyDevices,
  closeDevicePicker,
  getDevicePickerState,
  setLabel,
} from "@/entities/my-devices";
import type { ProductGroupEntity } from "@/entities/product";
import { dict } from "@/shared/config";

import { ProductCompatRow } from "./product-compat-row";

const models = [
  { id: "m-15", name: "iPhone 15", slug: "iphone-15", brandName: "Apple" },
  {
    id: "m-15pro",
    name: "iPhone 15 Pro",
    slug: "iphone-15-pro",
    brandName: "Apple",
  },
];

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

const row = dict.deviceFit.row;
const modelList = row.modelsMore("iPhone 15, iPhone 15 Pro", 0);

beforeEach(() => {
  window.localStorage.clear();
  clearMyDevices();
  closeDevicePicker();
});

function region() {
  return screen.getByRole("region", { name: row.aria });
}

describe("ProductCompatRow", () => {
  it("renders nothing for a product without compatibility data", () => {
    addDevice(iphone15Pro);
    const { container } = render(<ProductCompatRow models={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks for a device when none is saved, and opens the picker preset to the product's family", async () => {
    render(<ProductCompatRow models={models} />);
    expect(region()).toHaveAttribute("data-state", "ask");
    // A single-family product tints the ask row with that family's tone.
    expect(region()).toHaveClass("bg-family-iphone");
    expect(screen.getByText(row.askTitle(modelList))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: row.pickDevice }));
    expect(getDevicePickerState()).toMatchObject({
      open: true,
      request: { family: "iphone" },
    });
  });

  it("says it fits the active device, in the success tone, with «Інший пристрій»", async () => {
    addDevice(iphone15Pro);
    render(<ProductCompatRow models={models} />);
    expect(region()).toHaveAttribute("data-state", "fits");
    expect(screen.getByText(row.fitsTitle("iPhone 15 Pro"))).toHaveClass(
      "text-success",
    );

    await userEvent.click(
      screen.getByRole("button", { name: row.otherDevice }),
    );
    expect(getDevicePickerState().open).toBe(true);
  });

  it("names the owner's label when the fitting device has one", () => {
    addDevice(iphone15Pro);
    setLabel("m-15pro", "Мама");
    render(<ProductCompatRow models={models} />);
    expect(
      screen.getByText(row.fitsTitleLabelled("iPhone 15 Pro", "Мама")),
    ).toBeInTheDocument();
  });

  it("says it does not fit — neutral, with a link to the device hub", () => {
    addDevice(galaxyS24);
    render(<ProductCompatRow models={models} />);
    expect(region()).toHaveAttribute("data-state", "no-fit");
    expect(region()).toHaveClass("bg-muted");
    expect(region().className).not.toMatch(/destructive|sale|warning/);
    expect(screen.getByText(row.noFitTitle("Galaxy S24"))).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: row.allForDevice("Galaxy S24") }),
    ).toHaveAttribute("href", "/devices/galaxy-s24");
    expect(
      screen.getByRole("button", { name: row.otherDevice }),
    ).toBeInTheDocument();
  });

  it("answers for the other saved devices", () => {
    addDevice(galaxyS24);
    addDevice(iphone15Pro); // active
    render(<ProductCompatRow models={models} />);
    const list = screen.getByRole("list");
    const item = within(list).getByRole("listitem");
    expect(item).toHaveTextContent("Galaxy S24");
    expect(item).toHaveTextContent(row.otherNoFit);
  });

  it("flips its answer live when the active device changes", () => {
    addDevice(iphone15Pro);
    render(<ProductCompatRow models={models} />);
    expect(region()).toHaveAttribute("data-state", "fits");
    act(() => {
      addDevice(galaxyS24);
    });
    expect(region()).toHaveAttribute("data-state", "no-fit");
  });

  describe("a group with a variant for the device (state c)", () => {
    const iphone13 = {
      modelId: "m-13",
      slug: "iphone-13",
      name: "iPhone 13",
      brandName: "Apple",
      family: "iphone" as const,
    };
    const sibling = (slug: string, model: string, order: number) => ({
      id: slug,
      slug,
      name: slug,
      price: "999",
      attributes: { Модель: model, Колір: "Чорний" },
      stock: 1,
      isActive: true,
      positionOrder: order,
    });
    const group = {
      id: "g-1",
      name: "Clear Case",
      axes: [
        { name: "Модель", sortOrder: 0 },
        { name: "Колір", sortOrder: 1 },
      ],
      positions: [
        sibling("case-15pro", "iPhone 15 Pro", 0),
        sibling("case-13", "iPhone 13", 1),
      ],
    } as unknown as ProductGroupEntity;
    const props = {
      models: [models[1]],
      group,
      currentAttributes: { Модель: "iPhone 15 Pro", Колір: "Чорний" },
      currentSlug: "case-15pro",
      currentPrice: "999",
    };

    it("offers the sibling made for the active device instead of the hub", () => {
      addDevice(iphone13);
      setLabel("m-13", "Мама");
      render(<ProductCompatRow {...props} />);
      expect(region()).toHaveAttribute("data-state", "variant");
      expect(region()).toHaveClass("bg-muted");
      expect(
        screen.getByText(row.variantTitle("iPhone 15 Pro", "iPhone 13 · Мама")),
      ).toBeInTheDocument();
      expect(
        screen.getByText(row.variantSub("iPhone 13", true)),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: row.pickVariant("iPhone 13") }),
      ).toHaveAttribute("href", "/products/case-13");
      expect(
        screen.queryByRole("link", { name: row.allForDevice("iPhone 13") }),
      ).not.toBeInTheDocument();
    });

    it("offers «Варіант для нього» for another saved device without switching the active one", () => {
      addDevice(iphone13);
      addDevice(iphone15Pro); // active — fits
      render(<ProductCompatRow {...props} />);
      expect(region()).toHaveAttribute("data-state", "fits");
      const item = within(screen.getByRole("list")).getByRole("listitem");
      expect(
        within(item).getByRole("link", {
          name: row.otherVariantAria("iPhone 13"),
        }),
      ).toHaveAttribute("href", "/products/case-13");
    });
  });

  it("renders the neutral pending frame on the server — no personal verdict in cached HTML", () => {
    addDevice(iphone15Pro);
    const html = renderToString(<ProductCompatRow models={models} />);
    expect(html).toContain('data-state="pending"');
    expect(html).not.toContain(row.fitsTitle("iPhone 15 Pro"));
    expect(html).not.toContain(row.pickDevice);
  });
});
