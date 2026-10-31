import {
  EMPTY_DEVICES,
  MAX_DEVICE_LABEL_LENGTH,
  activateDevice,
  getActiveDevice,
  parseMyDevices,
  removeDeviceFrom,
  serializeMyDevices,
  setDeviceLabel,
  upsertDevice,
  type MyDevice,
  type MyDeviceInput,
} from "./my-devices";

const input = (
  id: string,
  extra: Partial<MyDeviceInput> = {},
): MyDeviceInput => ({
  modelId: id,
  slug: `slug-${id}`,
  name: `Model ${id}`,
  brandName: "Apple",
  family: "iphone",
  ...extra,
});

const ids = (list: readonly MyDevice[]) => list.map((d) => d.modelId);

describe("parseMyDevices", () => {
  it("returns the shared empty list for missing, corrupt or foreign JSON", () => {
    expect(parseMyDevices(null)).toBe(EMPTY_DEVICES);
    expect(parseMyDevices("")).toBe(EMPTY_DEVICES);
    expect(parseMyDevices("{not json")).toBe(EMPTY_DEVICES);
    expect(parseMyDevices('{"modelId":"a"}')).toBe(EMPTY_DEVICES);
    expect(parseMyDevices('"iphone"')).toBe(EMPTY_DEVICES);
    expect(parseMyDevices('["a","b"]')).toBe(EMPTY_DEVICES);
    expect(parseMyDevices("null")).toBe(EMPTY_DEVICES);
  });

  it("skips invalid entries and keeps valid ones", () => {
    const raw = JSON.stringify([
      { modelId: "", slug: "x", name: "X", lastUsedAt: 1 },
      { modelId: "a", slug: "a", name: "A", lastUsedAt: "yesterday" },
      {
        modelId: "b",
        slug: "b",
        name: "B",
        brandName: "Samsung",
        family: "galaxy",
        lastUsedAt: 5,
      },
      null,
      42,
    ]);
    expect(parseMyDevices(raw)).toEqual([
      {
        modelId: "b",
        slug: "b",
        name: "B",
        brandName: "Samsung",
        family: "galaxy",
        lastUsedAt: 5,
      },
    ]);
  });

  it("orders by lastUsedAt desc and keeps the newest duplicate", () => {
    const raw = JSON.stringify([
      { modelId: "a", slug: "a", name: "A", family: "iphone", lastUsedAt: 1 },
      { modelId: "b", slug: "b", name: "B", family: "ipad", lastUsedAt: 3 },
      {
        modelId: "a",
        slug: "a",
        name: "A",
        family: "iphone",
        label: "Мама",
        lastUsedAt: 2,
      },
    ]);
    const list = parseMyDevices(raw);
    expect(ids(list)).toEqual(["b", "a"]);
    expect(list[1].label).toBe("Мама");
  });

  it("degrades an unknown family to neutral and defaults brandName", () => {
    const [device] = parseMyDevices(
      JSON.stringify([
        {
          modelId: "p",
          slug: "p",
          name: "Pixel 9",
          family: "pixel",
          lastUsedAt: 1,
        },
      ]),
    );
    expect(device.family).toBeNull();
    expect(device.brandName).toBe("");
  });

  it("drops blank labels and round-trips through serialize", () => {
    const raw = JSON.stringify([
      {
        modelId: "a",
        slug: "a",
        name: "A",
        family: null,
        label: "   ",
        lastUsedAt: 1,
      },
    ]);
    const list = parseMyDevices(raw);
    expect(list[0]).not.toHaveProperty("label");
    expect(parseMyDevices(serializeMyDevices(list))).toEqual(list);
  });
});

describe("list operations", () => {
  it("upsertDevice adds to the front and makes it active, with no size limit", () => {
    let list: readonly MyDevice[] = EMPTY_DEVICES;
    for (let i = 0; i < 25; i += 1)
      list = upsertDevice(list, input(`m${i}`), 1000);
    expect(list).toHaveLength(25);
    expect(getActiveDevice(list)?.modelId).toBe("m24");
    // Same-millisecond adds still get strictly increasing stamps.
    expect(ids(parseMyDevices(serializeMyDevices(list)))).toEqual(ids(list));
  });

  it("re-adding a saved device moves it first without duplicating, keeping its label", () => {
    let list = upsertDevice(EMPTY_DEVICES, input("a", { label: "Мама" }), 1);
    list = upsertDevice(list, input("b"), 2);
    list = upsertDevice(list, input("a"), 3);
    expect(ids(list)).toEqual(["a", "b"]);
    expect(list[0].label).toBe("Мама");
  });

  it("stamps newer than every entry even if the clock stepped back", () => {
    let list = upsertDevice(EMPTY_DEVICES, input("a"), 5000);
    list = upsertDevice(list, input("b"), 10);
    expect(ids(list)).toEqual(["b", "a"]);
    expect(list[0].lastUsedAt).toBeGreaterThan(list[1].lastUsedAt);
  });

  it("activateDevice moves a saved device first; unknown or already-active → same list", () => {
    let list = upsertDevice(EMPTY_DEVICES, input("a"), 1);
    list = upsertDevice(list, input("b"), 2);
    list = upsertDevice(list, input("c"), 3);
    const next = activateDevice(list, "a", 4);
    expect(ids(next)).toEqual(["a", "c", "b"]);
    expect(activateDevice(list, "zzz", 4)).toBe(list);
    expect(activateDevice(list, "c", 4)).toBe(list);
  });

  it("removeDeviceFrom makes the next device active", () => {
    let list = upsertDevice(EMPTY_DEVICES, input("a"), 1);
    list = upsertDevice(list, input("b"), 2);
    const next = removeDeviceFrom(list, "b");
    expect(getActiveDevice(next)?.modelId).toBe("a");
    expect(removeDeviceFrom(list, "zzz")).toBe(list);
    expect(getActiveDevice(removeDeviceFrom(next, "a"))).toBeNull();
  });

  it("setDeviceLabel sets, trims, caps and clears without reordering", () => {
    let list = upsertDevice(EMPTY_DEVICES, input("a"), 1);
    list = upsertDevice(list, input("b"), 2);
    const labelled = setDeviceLabel(list, "a", "  Мама  ");
    expect(ids(labelled)).toEqual(["b", "a"]);
    expect(labelled[1].label).toBe("Мама");
    expect(setDeviceLabel(labelled, "a", "x".repeat(80))[1].label).toHaveLength(
      MAX_DEVICE_LABEL_LENGTH,
    );
    expect(setDeviceLabel(labelled, "a", " ")[1]).not.toHaveProperty("label");
    expect(setDeviceLabel(labelled, "a", null)[1]).not.toHaveProperty("label");
    expect(setDeviceLabel(list, "zzz", "Тато")).toBe(list);
  });
});
