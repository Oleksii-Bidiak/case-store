import {
  closeDevicePicker,
  getDevicePickerState,
  openDevicePicker,
} from "./device-picker-request";
import { toMyDeviceInput } from "./to-my-device-input";

afterEach(() => closeDevicePicker());

describe("device picker request (TASK-2070)", () => {
  it("starts closed", () => {
    expect(getDevicePickerState().open).toBe(false);
  });

  it("opens with the preset and bumps the sequence on every open", () => {
    const before = getDevicePickerState().seq;
    openDevicePicker({ query: "iphone 15", family: "iphone" });
    const first = getDevicePickerState();
    expect(first.open).toBe(true);
    expect(first.request).toEqual({ query: "iphone 15", family: "iphone" });
    expect(first.seq).toBe(before + 1);

    openDevicePicker();
    expect(getDevicePickerState().request).toEqual({});
    expect(getDevicePickerState().seq).toBe(before + 2);
  });

  it("closes, and a second close keeps the same snapshot", () => {
    openDevicePicker();
    closeDevicePicker();
    const closed = getDevicePickerState();
    expect(closed.open).toBe(false);
    closeDevicePicker();
    expect(getDevicePickerState()).toBe(closed);
  });

  it("copies the request so a caller's later mutation cannot leak in", () => {
    const request: { query?: string } = { query: "galaxy" };
    openDevicePicker(request);
    request.query = "changed";
    expect(getDevicePickerState().request.query).toBe("galaxy");
  });
});

describe("toMyDeviceInput", () => {
  it("maps a device-model row and resolves its family", () => {
    expect(
      toMyDeviceInput({
        id: "m1",
        slug: "galaxy-s24-ultra",
        name: "Galaxy S24 Ultra",
        brandName: "Samsung",
        brandSlug: "samsung",
        series: "Galaxy S24",
      }),
    ).toEqual({
      modelId: "m1",
      slug: "galaxy-s24-ultra",
      name: "Galaxy S24 Ultra",
      brandName: "Samsung",
      family: "galaxy",
    });
  });

  it("falls back to an empty brand and the neutral family", () => {
    expect(
      toMyDeviceInput({ id: "m2", slug: "pixel-9", name: "Pixel 9" }),
    ).toEqual({
      modelId: "m2",
      slug: "pixel-9",
      name: "Pixel 9",
      brandName: "",
      family: null,
    });
  });
});
