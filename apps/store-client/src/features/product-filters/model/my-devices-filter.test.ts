import type { MyDevice } from "@/entities/my-devices";
import {
  MAX_DEVICE_FILTER_SLUGS,
  allMyDevicesParam,
  isMyDevicesFilterOn,
  myDevicesSwitchUpdate,
  parseDeviceParam,
  resolveMyDevicesFilter,
} from "./my-devices-filter";

function device(slug: string, lastUsedAt: number): MyDevice {
  return {
    modelId: `id-${slug}`,
    slug,
    name: slug,
    brandName: "Apple",
    family: "iphone",
    lastUsedAt,
  };
}

const pro = device("iphone-15-pro", 3);
const thirteen = device("iphone-13", 2);
const watch = device("watch-s10-46", 1);
const saved = [pro, thirteen, watch];

describe("parseDeviceParam", () => {
  it("splits, trims, de-duplicates and drops blanks", () => {
    expect(parseDeviceParam(" a, b,,a ,")).toEqual(["a", "b"]);
  });

  it("reads nothing from an absent or empty param", () => {
    expect(parseDeviceParam(undefined)).toEqual([]);
    expect(parseDeviceParam(null)).toEqual([]);
    expect(parseDeviceParam("")).toEqual([]);
  });
});

describe("resolveMyDevicesFilter", () => {
  it("is off without a device param", () => {
    expect(resolveMyDevicesFilter(undefined, saved)).toEqual({ mode: "off" });
  });

  it("is «active» for one saved slug — even one that is not first", () => {
    expect(resolveMyDevicesFilter("iphone-13", saved)).toEqual({
      mode: "active",
      device: thirteen,
    });
  });

  it("is «all» for several saved slugs, in the URL's order", () => {
    expect(resolveMyDevicesFilter("iphone-13,iphone-15-pro", saved)).toEqual({
      mode: "all",
      devices: [thirteen, pro],
    });
  });

  it("is «other» when any slug is not a saved device", () => {
    expect(resolveMyDevicesFilter("galaxy-s24", saved)).toEqual({
      mode: "other",
      slugs: ["galaxy-s24"],
    });
    expect(resolveMyDevicesFilter("iphone-13,galaxy-s24", saved)).toEqual({
      mode: "other",
      slugs: ["iphone-13", "galaxy-s24"],
    });
  });

  it("reads a shared link as «other» in a browser with no saved devices", () => {
    expect(resolveMyDevicesFilter("iphone-13,iphone-15-pro", []).mode).toBe(
      "other",
    );
  });
});

describe("isMyDevicesFilterOn", () => {
  it("is on only when the saved list explains the param", () => {
    expect(isMyDevicesFilterOn({ mode: "off" })).toBe(false);
    expect(isMyDevicesFilterOn({ mode: "other", slugs: ["x"] })).toBe(false);
    expect(isMyDevicesFilterOn({ mode: "active", device: pro })).toBe(true);
    expect(isMyDevicesFilterOn({ mode: "all", devices: saved })).toBe(true);
  });
});

describe("allMyDevicesParam", () => {
  it("joins the slugs most-recent first", () => {
    expect(allMyDevicesParam(saved)).toBe(
      "iphone-15-pro,iphone-13,watch-s10-46",
    );
  });

  it("caps the list at the API's 20 slugs (TASK-2094)", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      device(`model-${i}`, 100 - i),
    );
    const slugs = allMyDevicesParam(many).split(",");
    expect(slugs).toHaveLength(MAX_DEVICE_FILTER_SLUGS);
    expect(slugs[0]).toBe("model-0");
    expect(slugs.at(-1)).toBe("model-19");
  });
});

describe("myDevicesSwitchUpdate", () => {
  it("turns on to the active (first) device", () => {
    expect(myDevicesSwitchUpdate(true, saved)).toEqual({
      device: "iphone-15-pro",
    });
  });

  it("turns off by dropping the param", () => {
    expect(myDevicesSwitchUpdate(false, saved)).toEqual({ device: undefined });
  });

  it("cannot turn on without a saved device", () => {
    expect(myDevicesSwitchUpdate(true, [])).toEqual({ device: undefined });
  });
});
