/**
 * «Мої пристрої» settings (TASK-2076) — the catalogue filter's defaults.
 */
import {
  DEFAULT_MY_DEVICES_SETTINGS,
  MY_DEVICES_SETTINGS_STORAGE_KEY,
  catalogFilterDefault,
  parseMyDevicesSettings,
  readMyDevicesSettings,
  resetMyDevicesSettings,
  updateMyDevicesSettings,
} from "./my-devices-settings";

beforeEach(() => {
  resetMyDevicesSettings();
  window.localStorage.clear();
});

describe("parseMyDevicesSettings", () => {
  it("defaults to «лише сумісне» on, for the active device", () => {
    expect(parseMyDevicesSettings(null)).toEqual({
      compatOnly: true,
      compatScope: "active",
    });
  });

  it("falls back to the defaults on corrupt or foreign JSON", () => {
    expect(parseMyDevicesSettings("{nope")).toBe(DEFAULT_MY_DEVICES_SETTINGS);
    expect(parseMyDevicesSettings("[1,2]")).toEqual(
      DEFAULT_MY_DEVICES_SETTINGS,
    );
    expect(parseMyDevicesSettings("42")).toBe(DEFAULT_MY_DEVICES_SETTINGS);
  });

  it("keeps each valid field and defaults the invalid one", () => {
    expect(
      parseMyDevicesSettings(
        JSON.stringify({ compatOnly: false, compatScope: "everyone" }),
      ),
    ).toEqual({ compatOnly: false, compatScope: "active" });
    expect(
      parseMyDevicesSettings(
        JSON.stringify({ compatOnly: "yes", compatScope: "all" }),
      ),
    ).toEqual({ compatOnly: true, compatScope: "all" });
  });
});

describe("catalogFilterDefault", () => {
  it("is on for the stored scope while «лише сумісне» is on", () => {
    expect(
      catalogFilterDefault({ compatOnly: true, compatScope: "all" }),
    ).toEqual({ on: true, scope: "all" });
  });

  it("is off — and never «all» — while «лише сумісне» is off", () => {
    expect(
      catalogFilterDefault({ compatOnly: false, compatScope: "all" }),
    ).toEqual({ on: false, scope: "active" });
  });
});

describe("settings storage", () => {
  it("persists an update under my-devices-settings:v1", () => {
    updateMyDevicesSettings({ compatScope: "all" });
    expect(readMyDevicesSettings()).toEqual({
      compatOnly: true,
      compatScope: "all",
    });
    expect(
      JSON.parse(
        window.localStorage.getItem(MY_DEVICES_SETTINGS_STORAGE_KEY) ?? "",
      ),
    ).toEqual({ compatOnly: true, compatScope: "all" });
  });

  it("keeps the stored scope when «лише сумісне» is switched off", () => {
    updateMyDevicesSettings({ compatScope: "all" });
    updateMyDevicesSettings({ compatOnly: false });
    expect(readMyDevicesSettings()).toEqual({
      compatOnly: false,
      compatScope: "all",
    });
  });

  it("reads what another tab wrote", () => {
    window.localStorage.setItem(
      MY_DEVICES_SETTINGS_STORAGE_KEY,
      JSON.stringify({ compatOnly: false, compatScope: "active" }),
    );
    expect(readMyDevicesSettings().compatOnly).toBe(false);
  });
});
