import {
  commonDeviceFamily,
  deviceDisplayName,
  deviceHubHref,
  deviceShortName,
  getDeviceFit,
  hasCompatData,
  summarizeModelNames,
} from "./device-fit";

describe("deviceShortName (TASK-1953)", () => {
  it.each([
    ["Apple Watch Series 10 46mm", "Watch S10 46mm"],
    ["Apple Watch Ultra 2 49mm", "Watch Ultra 2 49mm"],
    ["iPad 10th gen", "iPad 10"],
    ["iPad 10-го покоління", "iPad 10"],
  ])("condenses «%s» to «%s»", (name, short) => {
    expect(deviceShortName(name)).toBe(short);
  });

  it.each(["iPhone 15 Pro", "Galaxy S24 Ultra", 'iPad Air 13" (M2)'])(
    "leaves «%s» as is",
    (name) => {
      expect(deviceShortName(name)).toBe(name);
    },
  );
});

describe("deviceHubHref (TASK-1954)", () => {
  it("links to the model hub", () => {
    expect(deviceHubHref("galaxy-s24")).toBe("/devices/galaxy-s24");
  });
});

describe("getDeviceFit (TASK-1953)", () => {
  it("fits when the product lists the active device's model id", () => {
    expect(getDeviceFit(["m-1", "m-2"], { modelId: "m-2" })).toBe("fits");
  });

  it("does not fit when the product lists other models only", () => {
    expect(getDeviceFit(["m-1"], { modelId: "m-9" })).toBe("no-fit");
  });

  it("gives no verdict without an active device", () => {
    expect(getDeviceFit(["m-1"], null)).toBeNull();
    expect(getDeviceFit(["m-1"], undefined)).toBeNull();
  });

  it("gives no verdict for a product without compatibility data", () => {
    expect(getDeviceFit([], { modelId: "m-1" })).toBeNull();
    expect(getDeviceFit(undefined, { modelId: "m-1" })).toBeNull();
    expect(getDeviceFit(null, { modelId: "m-1" })).toBeNull();
  });
});

describe("hasCompatData", () => {
  it("is true only for a non-empty id list", () => {
    expect(hasCompatData(["m-1"])).toBe(true);
    expect(hasCompatData([])).toBe(false);
    expect(hasCompatData(undefined)).toBe(false);
  });
});

describe("deviceDisplayName", () => {
  it("appends the owner's label after a middle dot", () => {
    expect(deviceDisplayName({ name: "iPhone 13", label: "Мама" })).toBe(
      "iPhone 13 · Мама",
    );
  });

  it("is the bare name without a label", () => {
    expect(deviceDisplayName({ name: "iPhone 13" })).toBe("iPhone 13");
  });
});

describe("summarizeModelNames", () => {
  const models = ["A", "B", "C", "D", "E"].map((name) => ({ name }));

  it("names the first three and counts the rest", () => {
    expect(summarizeModelNames(models)).toEqual({ names: "A, B, C", rest: 2 });
  });

  it("names every model when there are few", () => {
    expect(summarizeModelNames(models.slice(0, 2))).toEqual({
      names: "A, B",
      rest: 0,
    });
  });
});

describe("commonDeviceFamily", () => {
  it("returns the family all target models share", () => {
    expect(
      commonDeviceFamily([
        { brandName: "Apple", name: "iPhone 15" },
        { brandName: "Apple", name: "iPhone 15 Pro" },
      ]),
    ).toBe("iphone");
  });

  it("is null when the models span families", () => {
    expect(
      commonDeviceFamily([
        { brandName: "Apple", name: "iPhone 15" },
        { brandName: "Samsung", name: "Galaxy S24" },
      ]),
    ).toBeNull();
  });

  it("is null when a model cannot be placed", () => {
    expect(
      commonDeviceFamily([
        { brandName: "Apple", name: "iPhone 15" },
        { brandName: "Nothing", name: "Phone (2)" },
      ]),
    ).toBeNull();
  });
});
