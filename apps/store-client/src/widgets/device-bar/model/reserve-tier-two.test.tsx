import { MY_DEVICES_STORAGE_KEY } from "@/entities/my-devices";

import { HAS_DEVICE_ATTR, RESERVE_TIER_TWO_SCRIPT } from "./reserve-tier-two";

/** Runs the inline script the way the browser does — as plain global code. */
function runScript(): void {
  new Function(RESERVE_TIER_TWO_SCRIPT)();
}

const html = () => document.documentElement;

beforeEach(() => {
  window.localStorage.clear();
  html().removeAttribute(HAS_DEVICE_ATTR);
});

describe("RESERVE_TIER_TWO_SCRIPT (TASK-2074, no CLS for tier 2)", () => {
  it("flags <html> when a device is saved", () => {
    window.localStorage.setItem(
      MY_DEVICES_STORAGE_KEY,
      JSON.stringify([{ modelId: "a", slug: "iphone-15-pro" }]),
    );
    runScript();
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);
  });

  it.each([
    ["nothing is saved", null],
    ["the list is empty", "[]"],
    ["the value is not a list", '{"theme":"dark"}'],
    ["the JSON is broken", "{oops"],
  ])("leaves <html> alone when %s", (_, raw) => {
    if (raw !== null) window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, raw);
    runScript();
    expect(html()).not.toHaveAttribute(HAS_DEVICE_ATTR);
  });

  it("swallows a storage that throws (private mode) instead of erroring", () => {
    const spy = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    expect(runScript).not.toThrow();
    expect(html()).not.toHaveAttribute(HAS_DEVICE_ATTR);
    spy.mockRestore();
  });
});
