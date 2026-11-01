import type { MyDevice } from "@/entities/my-devices";
import { getWishlistDeviceFit } from "./wishlist-device-fit";

function device(modelId: string, name: string): MyDevice {
  return {
    modelId,
    slug: modelId,
    name,
    brandName: "Apple",
    family: "iphone",
    lastUsedAt: 1,
  };
}

const ip15 = device("ip15", "iPhone 15");
const ip13 = device("ip13", "iPhone 13");

describe("getWishlistDeviceFit (TASK-1300)", () => {
  it("gives no verdict without a device or without compatibility data", () => {
    expect(getWishlistDeviceFit(["ip15"], [])).toBeNull();
    expect(getWishlistDeviceFit([], [ip15])).toBeNull();
    expect(getWishlistDeviceFit(undefined, [ip15])).toBeNull();
  });

  it("lists every saved device the product fits, in the saved order", () => {
    expect(getWishlistDeviceFit(["ip13", "ip15"], [ip15, ip13])).toEqual({
      verdict: "fits",
      devices: [ip15, ip13],
    });
    expect(getWishlistDeviceFit(["ip13"], [ip15, ip13])).toEqual({
      verdict: "fits",
      devices: [ip13],
    });
  });

  it("says no-fit when none of the saved devices is compatible", () => {
    expect(getWishlistDeviceFit(["pixel"], [ip15, ip13])).toEqual({
      verdict: "no-fit",
    });
  });
});
