import {
  DEVICE_FILTER_ATTR,
  DEVICE_FILTER_EXPIRED_ATTR,
  HAS_DEVICE_ATTR,
  PRE_PAINT_FILTER_TIMEOUT_MS,
  syncDeviceFlags,
} from "./device-flags";
import {
  MY_DEVICES_STORAGE_KEY,
  addDevice,
  clearMyDevices,
  replaceMyDevices,
  syncFlags,
} from "./my-devices-storage";
import {
  MY_DEVICES_SETTINGS_STORAGE_KEY,
  replaceMyDevicesSettings,
  updateMyDevicesSettings,
} from "./my-devices-settings";
import { PRE_PAINT_FLAGS_SCRIPT } from "./pre-paint-flags";

/** Runs the inline script the way the browser does — as plain global code. */
function runScript(): void {
  new Function(PRE_PAINT_FLAGS_SCRIPT)();
}

const html = () => document.documentElement;
const DEVICE = JSON.stringify([{ modelId: "a", slug: "iphone-15-pro" }]);

function resetFlags(): void {
  html().removeAttribute(HAS_DEVICE_ATTR);
  html().removeAttribute(DEVICE_FILTER_ATTR);
  html().removeAttribute(DEVICE_FILTER_EXPIRED_ATTR);
}

beforeEach(() => {
  window.localStorage.clear();
  resetFlags();
});

describe("PRE_PAINT_FLAGS_SCRIPT (TASK-2421 / TASK-2074)", () => {
  it("flags a saved device and the default filter (no settings = defaults)", () => {
    window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, DEVICE);
    runScript();
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it("keeps the device flag but not the filter when «лише сумісне» is off", () => {
    window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, DEVICE);
    window.localStorage.setItem(
      MY_DEVICES_SETTINGS_STORAGE_KEY,
      JSON.stringify({ compatOnly: false, compatScope: "all" }),
    );
    runScript();
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it.each([
    ["broken JSON", "{oops"],
    ["not an object", '"on"'],
    ["a non-boolean compatOnly", '{"compatOnly":"no"}'],
    ["compatOnly on", '{"compatOnly":true}'],
  ])("treats settings with %s as the defaults (filter on)", (_, raw) => {
    window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, DEVICE);
    window.localStorage.setItem(MY_DEVICES_SETTINGS_STORAGE_KEY, raw);
    runScript();
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it.each([
    ["nothing is saved", null],
    ["the list is empty", "[]"],
    ["the value is not a list", '{"theme":"dark"}'],
    ["the JSON is broken", "{oops"],
  ])("sets no flag when %s", (_, raw) => {
    if (raw !== null) window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, raw);
    runScript();
    expect(html()).not.toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it("sets no flag for a list without a single usable entry (`[{}]`)", () => {
    window.localStorage.setItem(
      MY_DEVICES_STORAGE_KEY,
      '[{},null,{"modelId":""}]',
    );
    runScript();
    expect(html()).not.toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it("expires the filter gate when the app has not hydrated in time", () => {
    jest.useFakeTimers();
    try {
      window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, DEVICE);
      runScript();
      expect(html()).not.toHaveAttribute(DEVICE_FILTER_EXPIRED_ATTR);
      jest.advanceTimersByTime(PRE_PAINT_FILTER_TIMEOUT_MS);
      expect(html()).toHaveAttribute(DEVICE_FILTER_EXPIRED_ATTR);
    } finally {
      jest.useRealTimers();
    }
  });

  it("starts no expiry timer when the filter does not apply", () => {
    jest.useFakeTimers();
    try {
      window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, DEVICE);
      window.localStorage.setItem(
        MY_DEVICES_SETTINGS_STORAGE_KEY,
        JSON.stringify({ compatOnly: false, compatScope: "all" }),
      );
      runScript();
      jest.advanceTimersByTime(PRE_PAINT_FILTER_TIMEOUT_MS);
      expect(html()).not.toHaveAttribute(DEVICE_FILTER_EXPIRED_ATTR);
    } finally {
      jest.useRealTimers();
    }
  });

  it("swallows a storage that throws (private mode) instead of erroring", () => {
    const spy = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    expect(runScript).not.toThrow();
    expect(html()).not.toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
    spy.mockRestore();
  });
});

describe("syncDeviceFlags — the flags stay live after first paint", () => {
  afterEach(() => {
    clearMyDevices();
    replaceMyDevicesSettings(null);
  });

  it("follows the shopper's own edits of the list", () => {
    addDevice({
      modelId: "a",
      slug: "iphone-15-pro",
      name: "iPhone 15 Pro",
      brandName: "Apple",
      family: "iphone",
    });
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).toHaveAttribute(DEVICE_FILTER_ATTR);

    clearMyDevices();
    expect(html()).not.toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it("follows the account's list (the server-replace path, TASK-1959)", () => {
    replaceMyDevices([
      {
        modelId: "a",
        slug: "iphone-15-pro",
        name: "iPhone 15 Pro",
        brandName: "Apple",
        family: "iphone",
        lastUsedAt: 1,
      },
    ]);
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);

    replaceMyDevices([]);
    expect(html()).not.toHaveAttribute(HAS_DEVICE_ATTR);
  });

  it("follows «лише сумісне» from the panel and from the account", () => {
    addDevice({
      modelId: "a",
      slug: "iphone-15-pro",
      name: "iPhone 15 Pro",
      brandName: "Apple",
      family: "iphone",
    });

    updateMyDevicesSettings({ compatOnly: false });
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);

    replaceMyDevicesSettings({ compatOnly: true, compatScope: "active" });
    expect(html()).toHaveAttribute(DEVICE_FILTER_ATTR);

    // Settings alone never claim a device.
    clearMyDevices();
    updateMyDevicesSettings({ compatOnly: false });
    updateMyDevicesSettings({ compatOnly: true });
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it("needs both halves for the filter flag", () => {
    syncDeviceFlags(false, true);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
    syncDeviceFlags(true, false);
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it("the first-mount resync clears flags the script set for an invalid entry", () => {
    // Has a modelId, so the script flags it; misses slug/name, so the store drops it.
    window.localStorage.setItem(
      MY_DEVICES_STORAGE_KEY,
      JSON.stringify([{ modelId: "a" }]),
    );
    runScript();
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);

    syncFlags();
    expect(html()).not.toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
  });
});
