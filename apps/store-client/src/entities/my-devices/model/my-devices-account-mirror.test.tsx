/**
 * «Мої пристрої» as the mirror of the account (TASK-1959): the store must tell a
 * shopper's OWN edit (which the sync pushes to the server) from the server's
 * state being applied (which must not be pushed back — no echo), and remember
 * whose account the mirror belongs to.
 */
import {
  MY_DEVICES_OWNER_STORAGE_KEY,
  MY_DEVICES_SETTINGS_STORAGE_KEY,
  MY_DEVICES_STORAGE_KEY,
  addDevice,
  clearMyDevices,
  hasLocalMyDevicesState,
  readMyDevices,
  readMyDevicesOwner,
  readMyDevicesSettings,
  removeDevice,
  replaceMyDevices,
  replaceMyDevicesSettings,
  setActiveDevice,
  setLabel,
  subscribeMyDevicesEdits,
  updateMyDevicesSettings,
  writeMyDevicesOwner,
  type MyDevice,
} from "@/entities/my-devices";
import { subscribeMyDevices } from "./my-devices-storage";
import { subscribeMyDevicesSettings } from "./my-devices-settings";

const IPHONE = {
  modelId: "m-iphone",
  slug: "iphone-15-pro",
  name: "iPhone 15 Pro",
  brandName: "Apple",
  family: "iphone" as const,
};
const GALAXY: MyDevice = {
  modelId: "m-galaxy",
  slug: "galaxy-s24",
  name: "Galaxy S24",
  brandName: "Samsung",
  family: "galaxy",
  label: "Мама",
  lastUsedAt: 1_700_000_000_000,
};

function reset() {
  replaceMyDevices([]);
  replaceMyDevicesSettings(null);
  writeMyDevicesOwner(null);
  window.localStorage.clear();
}

beforeEach(reset);
afterEach(reset);

describe("replaceMyDevices — the server state applied locally", () => {
  it("replaces the list and re-renders subscribers", () => {
    const onChange = jest.fn();
    const unsubscribe = subscribeMyDevices(onChange);
    addDevice(IPHONE);
    onChange.mockClear();

    replaceMyDevices([GALAXY]);

    expect(readMyDevices()).toEqual([GALAXY]);
    expect(onChange).toHaveBeenCalled();
    unsubscribe();
  });

  it("is NOT reported as an edit — so the sync never echoes it back", () => {
    const onEdit = jest.fn();
    const unsubscribe = subscribeMyDevicesEdits(onEdit);

    replaceMyDevices([GALAXY]);
    replaceMyDevicesSettings({ compatOnly: false, compatScope: "all" });

    expect(onEdit).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("an empty list removes the storage key", () => {
    replaceMyDevices([GALAXY]);
    replaceMyDevices([]);
    expect(window.localStorage.getItem(MY_DEVICES_STORAGE_KEY)).toBeNull();
    expect(readMyDevices()).toEqual([]);
  });
});

describe("subscribeMyDevicesEdits — the shopper's own changes", () => {
  it.each([
    ["addDevice", () => addDevice(IPHONE)],
    ["setActiveDevice", () => setActiveDevice("m-iphone")],
    ["removeDevice", () => removeDevice("m-galaxy")],
    ["setLabel", () => setLabel("m-galaxy", "Тато")],
    ["clearMyDevices", () => clearMyDevices()],
    [
      "updateMyDevicesSettings",
      () => updateMyDevicesSettings({ compatOnly: false }),
    ],
  ])("%s is reported as an edit", (_name, edit) => {
    replaceMyDevices([GALAXY, { ...IPHONE, lastUsedAt: 1 }]);
    const onEdit = jest.fn();
    const unsubscribe = subscribeMyDevicesEdits(onEdit);

    edit();

    expect(onEdit).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("a no-op change is not an edit", () => {
    const onEdit = jest.fn();
    const unsubscribe = subscribeMyDevicesEdits(onEdit);
    removeDevice("not-saved");
    updateMyDevicesSettings({ compatOnly: true });
    expect(onEdit).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe("replaceMyDevicesSettings", () => {
  it("applies the settings and re-renders subscribers", () => {
    const onChange = jest.fn();
    const unsubscribe = subscribeMyDevicesSettings(onChange);

    replaceMyDevicesSettings({ compatOnly: false, compatScope: "all" });

    expect(readMyDevicesSettings()).toEqual({
      compatOnly: false,
      compatScope: "all",
    });
    expect(onChange).toHaveBeenCalled();
    unsubscribe();
  });

  it("null forgets them — back to the defaults, key removed", () => {
    replaceMyDevicesSettings({ compatOnly: false, compatScope: "all" });
    replaceMyDevicesSettings(null);
    expect(readMyDevicesSettings()).toEqual({
      compatOnly: true,
      compatScope: "active",
    });
    expect(
      window.localStorage.getItem(MY_DEVICES_SETTINGS_STORAGE_KEY),
    ).toBeNull();
  });
});

describe("owner marker", () => {
  it("is null until written, keeps the user id, and clears with null", () => {
    expect(readMyDevicesOwner()).toBeNull();
    writeMyDevicesOwner("user-1");
    expect(readMyDevicesOwner()).toBe("user-1");
    expect(window.localStorage.getItem(MY_DEVICES_OWNER_STORAGE_KEY)).toBe(
      "user-1",
    );
    writeMyDevicesOwner(null);
    expect(readMyDevicesOwner()).toBeNull();
    expect(
      window.localStorage.getItem(MY_DEVICES_OWNER_STORAGE_KEY),
    ).toBeNull();
  });
});

describe("hasLocalMyDevicesState", () => {
  it("is false for a fresh browser", () => {
    expect(hasLocalMyDevicesState()).toBe(false);
  });

  it("is true once a device is saved", () => {
    addDevice(IPHONE);
    expect(hasLocalMyDevicesState()).toBe(true);
  });

  it("is true once the settings were changed, even with no device", () => {
    updateMyDevicesSettings({ compatScope: "all" });
    expect(hasLocalMyDevicesState()).toBe(true);
  });
});
