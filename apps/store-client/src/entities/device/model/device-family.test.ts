import {
  DEVICE_FAMILIES,
  DEVICE_FAMILY_TONE,
  NEUTRAL_FAMILY_TONE,
  getDeviceFamily,
  getDeviceFamilyTone,
  isDeviceFamily,
} from "./device-family";

describe("getDeviceFamily", () => {
  it.each([
    [
      { brandName: "Apple", series: "iPhone 15", name: "iPhone 15 Pro" },
      "iphone",
    ],
    [
      { brandName: "Apple", series: "iPad Pro", name: 'iPad Pro 13" (M4)' },
      "ipad",
    ],
    [{ brandName: "Apple", series: "iPad", name: "iPad 10th gen" }, "ipad"],
    [
      {
        brandName: "Apple",
        series: "Apple Watch",
        name: "Apple Watch Ultra 2 49mm",
      },
      "watch",
    ],
    [
      { brandName: "Samsung", series: "Galaxy S24", name: "Galaxy S24 Ultra" },
      "galaxy",
    ],
    [
      { brandName: "Samsung", series: "Galaxy Tab", name: "Galaxy Tab S9" },
      "galaxy",
    ],
    [{ brandName: "Samsung", series: null, name: "Galaxy Watch 7" }, "galaxy"],
    [
      {
        brandName: "Xiaomi",
        series: "Redmi Note 13",
        name: "Redmi Note 13 Pro",
      },
      "redmi",
    ],
    [
      { brandName: "Xiaomi", series: "Xiaomi 14", name: "Xiaomi 14 Ultra" },
      "redmi",
    ],
    [{ brandSlug: "poco", name: "POCO F6" }, "redmi"],
  ] as const)("%o → %s", (source, family) => {
    expect(getDeviceFamily(source)).toBe(family);
  });

  it("falls back to series / name keywords when the brand is unknown", () => {
    expect(getDeviceFamily({ name: "iPhone 13 mini" })).toBe("iphone");
    expect(getDeviceFamily({ series: "Galaxy A" })).toBe("galaxy");
    expect(getDeviceFamily({ name: "Redmi 13C" })).toBe("redmi");
    expect(getDeviceFamily({ name: "Apple Watch SE" })).toBe("watch");
  });

  it("returns null (neutral) for anything it cannot place", () => {
    expect(
      getDeviceFamily({ brandName: "Apple", name: "AirPods Pro 2" }),
    ).toBeNull();
    expect(
      getDeviceFamily({ brandName: "Google", name: "Pixel 9" }),
    ).toBeNull();
    expect(getDeviceFamily({})).toBeNull();
  });

  it("does not match a keyword inside another word", () => {
    expect(getDeviceFamily({ name: "Mipadlike 3" })).toBeNull();
  });
});

describe("family tone lookup", () => {
  it("maps every family to its static family-* utilities", () => {
    for (const family of DEVICE_FAMILIES) {
      expect(getDeviceFamilyTone(family)).toEqual({
        surface: `bg-family-${family}`,
        strong: `bg-family-${family}-strong`,
      });
      expect(DEVICE_FAMILY_TONE[family]).toBe(getDeviceFamilyTone(family));
    }
  });

  it("uses the neutral tone for an unknown family", () => {
    expect(getDeviceFamilyTone(null)).toBe(NEUTRAL_FAMILY_TONE);
    expect(getDeviceFamilyTone(undefined)).toEqual({
      surface: "bg-muted",
      strong: "bg-muted-foreground",
    });
  });

  it("guards family keys", () => {
    expect(isDeviceFamily("ipad")).toBe(true);
    expect(isDeviceFamily("pixel")).toBe(false);
    expect(isDeviceFamily(3)).toBe(false);
  });
});
