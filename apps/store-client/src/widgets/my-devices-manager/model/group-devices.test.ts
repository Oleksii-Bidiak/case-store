/**
 * «Мої пристрої» grouping and label suggestions (TASK-2076).
 */
import type { MyDevice } from "@/entities/my-devices";
import {
  groupDevicesByLabel,
  labelSuggestions,
  myDeviceHubPath,
} from "./group-devices";

let stamp = 100;
const device = (modelId: string, label?: string): MyDevice => ({
  modelId,
  slug: modelId,
  name: modelId,
  brandName: "Apple",
  family: "iphone",
  lastUsedAt: stamp--,
  ...(label ? { label } : {}),
});

const DEFAULTS = ["Мама", "Тато", "Син", "Донька", "Робочий"];

describe("groupDevicesByLabel", () => {
  it("puts «Мої» first, then labels in first-appearance order", () => {
    const list = [
      device("15pro"),
      device("watch"),
      device("ipad"),
      device("13", "Мама"),
      device("a55", "Тато"),
      device("redmi", "Син"),
      device("12mini", "Бабуся"),
      device("watch42", "Мама"),
      device("ipad10", "Син"),
      device("s23", "Робочий"),
    ];
    const groups = groupDevicesByLabel(list);
    expect(groups.map((g) => [g.label, g.devices.length])).toEqual([
      [null, 3],
      ["Мама", 2],
      ["Тато", 1],
      ["Син", 2],
      ["Бабуся", 1],
      ["Робочий", 1],
    ]);
    // List order is kept inside a group — the active (first) device leads.
    expect(groups[0].devices[0].modelId).toBe("15pro");
    expect(groups[1].devices.map((d) => d.modelId)).toEqual(["13", "watch42"]);
  });

  it("keeps «Мої» first even when a labelled device is active", () => {
    const groups = groupDevicesByLabel([device("13", "Мама"), device("15pro")]);
    expect(groups.map((g) => g.label)).toEqual([null, "Мама"]);
  });

  it("has no «Мої» group when every device is labelled", () => {
    expect(
      groupDevicesByLabel([device("13", "Мама")]).map((g) => g.label),
    ).toEqual(["Мама"]);
  });

  it("groups labels case-insensitively under the first spelling", () => {
    const groups = groupDevicesByLabel([
      device("13", "Мама"),
      device("watch", "мама"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Мама");
    expect(groups[0].devices).toHaveLength(2);
  });

  it("returns no groups for no devices", () => {
    expect(groupDevicesByLabel([])).toEqual([]);
  });
});

describe("labelSuggestions", () => {
  it("offers the defaults when nothing is labelled", () => {
    expect(labelSuggestions([device("15pro")], DEFAULTS)).toEqual(DEFAULTS);
  });

  it("puts labels in use first, de-duplicated, five at most", () => {
    const list = [
      device("12mini", "Бабуся"),
      device("13", "Мама"),
      device("watch", "мама"),
    ];
    expect(labelSuggestions(list, DEFAULTS)).toEqual([
      "Бабуся",
      "Мама",
      "Тато",
      "Син",
      "Донька",
    ]);
  });
});

describe("myDeviceHubPath", () => {
  it("links to the model hub", () => {
    expect(myDeviceHubPath("iphone-15-pro")).toBe("/devices/iphone-15-pro");
  });
});
