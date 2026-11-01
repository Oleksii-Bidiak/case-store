/**
 * Rule 7 of the Product mockup: an active device with a variant of this
 * product pre-selects that variant, once per group.
 */
import { renderHook } from "@testing-library/react";

import { addDevice, clearMyDevices } from "@/entities/my-devices";
import type { ProductGroupEntity } from "@/entities/product";

import {
  resetPreselectedGroups,
  usePreselectDeviceVariant,
} from "./use-preselect-device-variant";

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));

const sibling = (slug: string, model: string, order: number) => ({
  id: slug,
  slug,
  name: slug,
  price: "999",
  attributes: { Модель: model },
  stock: 1,
  isActive: true,
  positionOrder: order,
});

const group = {
  id: "g-1",
  name: "Clear Case",
  axes: [{ name: "Модель", sortOrder: 0 }],
  positions: [
    sibling("case-15pro", "iPhone 15 Pro", 0),
    sibling("case-13", "iPhone 13", 1),
  ],
} as unknown as ProductGroupEntity;

const iphone13 = {
  modelId: "m-13",
  slug: "iphone-13",
  name: "iPhone 13",
  brandName: "Apple",
  family: "iphone" as const,
};

const args = {
  group,
  currentAttributes: { Модель: "iPhone 15 Pro" },
  currentSlug: "case-15pro",
  compatibleDeviceModelIds: ["m-15pro"],
};

beforeEach(() => {
  window.localStorage.clear();
  clearMyDevices();
  resetPreselectedGroups();
  mockReplace.mockClear();
});

describe("usePreselectDeviceVariant", () => {
  it("opens the active device's variant on the first visit to the group", () => {
    addDevice(iphone13);
    renderHook(() => usePreselectDeviceVariant(args));
    expect(mockReplace).toHaveBeenCalledWith("/products/case-13", {
      scroll: false,
    });
  });

  it("leaves a later, explicit choice in the same group alone", () => {
    addDevice(iphone13);
    renderHook(() => usePreselectDeviceVariant(args));
    mockReplace.mockClear();
    renderHook(() => usePreselectDeviceVariant(args));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("stays put when the current position already fits the device", () => {
    addDevice(iphone13);
    renderHook(() =>
      usePreselectDeviceVariant({
        ...args,
        compatibleDeviceModelIds: ["m-13"],
      }),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does nothing without a saved device", () => {
    renderHook(() => usePreselectDeviceVariant(args));
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
