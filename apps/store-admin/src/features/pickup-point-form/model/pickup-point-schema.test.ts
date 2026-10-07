import { dict } from "@/shared/config";
import {
  EMPTY_PICKUP_POINT,
  isHttpUrl,
  mapPickupPointToForm,
  pickupPointFormToDto,
  pickupPointSchema,
} from "./pickup-point-schema";

const e = dict.pickupPointForm.errors;

const valid = {
  ...EMPTY_PICKUP_POINT,
  name: "Магазин на Оболоні",
  city: "Київ",
  address: "просп. Оболонський, 1",
};

function messages(values: unknown): Record<string, string> {
  const result = pickupPointSchema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

describe("pickupPointSchema (TASK-645)", () => {
  it("accepts a point with only the required fields", () => {
    expect(pickupPointSchema.safeParse(valid).success).toBe(true);
  });

  it("requires name, city and address — whitespace is not a value", () => {
    expect(
      messages({ ...EMPTY_PICKUP_POINT, name: "   ", city: "", address: " " }),
    ).toEqual({
      name: e.nameRequired,
      city: e.cityRequired,
      address: e.addressRequired,
    });
  });

  it("takes only an http(s) map link", () => {
    expect(messages({ ...valid, mapUrl: "maps.app.goo.gl/x" })).toEqual({
      mapUrl: e.mapUrlInvalid,
    });
    expect(messages({ ...valid, mapUrl: "javascript:alert(1)" })).toEqual({
      mapUrl: e.mapUrlInvalid,
    });
    expect(messages({ ...valid, mapUrl: "https://maps.app.goo.gl/x" })).toEqual(
      {},
    );
    expect(messages({ ...valid, mapUrl: "" })).toEqual({});
  });

  it("mirrors the API's length limits", () => {
    expect(messages({ ...valid, phone: "1".repeat(51) })).toEqual({
      phone: e.tooLong(50),
    });
    expect(messages({ ...valid, address: "a".repeat(501) })).toEqual({
      address: e.tooLong(500),
    });
  });
});

describe("isHttpUrl", () => {
  it.each([
    ["https://maps.app.goo.gl/abc", true],
    ["http://example.com", true],
    ["ftp://example.com", false],
    ["https://localhost", false],
    ["not a url", false],
  ])("%s → %s", (value, expected) => {
    expect(isHttpUrl(value)).toBe(expected);
  });
});

describe("pickupPointFormToDto / mapPickupPointToForm", () => {
  it("trims, and sends blank optional fields as null (cleared, not kept)", () => {
    expect(
      pickupPointFormToDto({
        name: "  Склад ",
        city: " Київ",
        address: "вул. Причальна, 11 ",
        phone: "  ",
        workingHours: "",
        mapUrl: " https://maps.app.goo.gl/x ",
        isActive: false,
      }),
    ).toEqual({
      name: "Склад",
      city: "Київ",
      address: "вул. Причальна, 11",
      phone: null,
      workingHours: null,
      mapUrl: "https://maps.app.goo.gl/x",
      isActive: false,
    });
  });

  it("maps a stored point's nulls to empty fields", () => {
    expect(
      mapPickupPointToForm({
        id: "p1",
        name: "Склад",
        city: "Київ",
        address: "вул. Причальна, 11",
        phone: null,
        workingHours: null,
        mapUrl: null,
        isActive: true,
        sortOrder: 0,
        ordersCount: 4,
      }),
    ).toEqual({
      name: "Склад",
      city: "Київ",
      address: "вул. Причальна, 11",
      phone: "",
      workingHours: "",
      mapUrl: "",
      isActive: true,
    });
  });
});
