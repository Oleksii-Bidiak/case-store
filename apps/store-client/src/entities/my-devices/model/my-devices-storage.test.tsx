/**
 * Storage + hook tests for «Мої пристрої» (TASK-2074). jsdom project because
 * the store talks to window.localStorage; `.tsx` only routes it there.
 */
import { act, renderHook } from "@testing-library/react";

import type { MyDeviceInput } from "./my-devices";
import {
  MY_DEVICES_STORAGE_KEY,
  addDevice,
  clearMyDevices,
  getMyDevicesServerSnapshot,
  getMyDevicesSnapshot,
  readMyDevices,
  removeDevice,
  setActiveDevice,
  setDeviceLabelById,
} from "./my-devices-storage";
import { useActiveDevice, useMyDevices } from "./use-my-devices";

const device = (
  id: string,
  family: MyDeviceInput["family"] = "iphone",
): MyDeviceInput => ({
  modelId: id,
  slug: `slug-${id}`,
  name: `Model ${id}`,
  brandName: "Apple",
  family,
});

const storedIds = () =>
  (
    JSON.parse(
      window.localStorage.getItem(MY_DEVICES_STORAGE_KEY) ?? "[]",
    ) as Array<{
      modelId: string;
    }>
  ).map((d) => d.modelId);

beforeEach(() => {
  window.localStorage.clear();
});

describe("my-devices storage", () => {
  it("persists under my-devices:v1, most recent first", () => {
    addDevice(device("a"));
    addDevice(device("b", "galaxy"));
    expect(storedIds()).toEqual(["b", "a"]);
    expect(readMyDevices()[0]).toMatchObject({
      modelId: "b",
      family: "galaxy",
    });
  });

  it("setActiveDevice, setDeviceLabelById and removeDevice update the stored list", () => {
    addDevice(device("a"));
    addDevice(device("b"));
    setActiveDevice("a");
    expect(storedIds()).toEqual(["a", "b"]);
    setDeviceLabelById("b", "Мама");
    expect(readMyDevices()[1].label).toBe("Мама");
    removeDevice("a");
    expect(storedIds()).toEqual(["b"]);
    removeDevice("b");
    expect(window.localStorage.getItem(MY_DEVICES_STORAGE_KEY)).toBeNull();
  });

  it("treats corrupt or foreign storage as an empty list", () => {
    window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, "{oops");
    expect(readMyDevices()).toEqual([]);
    window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, '{"theme":"dark"}');
    expect(readMyDevices()).toEqual([]);
    // Adding over garbage starts a clean list.
    addDevice(device("a"));
    expect(storedIds()).toEqual(["a"]);
  });

  it("returns a stable snapshot while the data is unchanged; server snapshot is empty", () => {
    addDevice(device("a"));
    expect(getMyDevicesSnapshot()).toBe(getMyDevicesSnapshot());
    expect(getMyDevicesServerSnapshot()).toEqual([]);
  });

  it("clearMyDevices forgets everything", () => {
    addDevice(device("a"));
    clearMyDevices();
    expect(readMyDevices()).toEqual([]);
  });
});

describe("useMyDevices / useActiveDevice", () => {
  it("re-render on local changes", () => {
    const { result } = renderHook(() => ({
      list: useMyDevices(),
      active: useActiveDevice(),
    }));
    expect(result.current.list).toEqual([]);
    expect(result.current.active).toBeNull();

    act(() => addDevice(device("a")));
    act(() => addDevice(device("b")));
    expect(result.current.list.map((d) => d.modelId)).toEqual(["b", "a"]);
    expect(result.current.active?.modelId).toBe("b");

    act(() => removeDevice("b"));
    expect(result.current.active?.modelId).toBe("a");
  });

  it("sync from another tab via the storage event", () => {
    const { result } = renderHook(() => useActiveDevice());
    expect(result.current).toBeNull();

    act(() => {
      window.localStorage.setItem(
        MY_DEVICES_STORAGE_KEY,
        JSON.stringify([
          {
            modelId: "x",
            slug: "x",
            name: "iPhone 15 Pro",
            brandName: "Apple",
            family: "iphone",
            lastUsedAt: 1,
          },
        ]),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: MY_DEVICES_STORAGE_KEY }),
      );
    });
    expect(result.current?.name).toBe("iPhone 15 Pro");
  });
});
