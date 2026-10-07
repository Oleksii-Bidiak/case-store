import type { DeliverySettingDto } from "@/entities/delivery";
import { dict } from "@/shared/config";
import {
  deliverySettingsFormToDto,
  deliverySettingsSchema,
  mapSettingsToForm,
  parseDecimal,
  type DeliverySettingsFormValues,
} from "./delivery-settings-schema";

const e = dict.deliverySettingsForm.errors;

const SETTINGS: DeliverySettingDto = {
  senderCityRef: "city-kyiv",
  senderCityName: "Київ, Київська обл.",
  senderWarehouseRef: "wh-1",
  defaultWeightKg: 0.5,
  npEnabled: true,
  pickupEnabled: false,
  courierEnabled: true,
  otherEnabled: true,
  courierCityName: "Київ",
  courierPrice: "150.00",
  courierFreeFrom: "2000.00",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function valuesWith(
  patch: Partial<DeliverySettingsFormValues>,
): DeliverySettingsFormValues {
  return { ...mapSettingsToForm(SETTINGS, "Відділення №1"), ...patch };
}

function messagesOf(values: DeliverySettingsFormValues) {
  const result = deliverySettingsSchema.safeParse(values);
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((issue) => [issue.path[0], issue.message]),
      );
}

describe("parseDecimal", () => {
  it.each([
    ["150", 2, 150],
    ["0,5", 3, 0.5],
    ["2 000", 2, 2000],
    [" 29.90 ", 2, 29.9],
  ])("reads %j as %d", (raw, places, expected) => {
    expect(parseDecimal(raw, places)).toBe(expected);
  });

  it.each([
    ["", 2],
    ["абв", 2],
    ["-1", 2],
    ["1.234", 2],
    ["1e3", 2],
  ])("refuses %j", (raw, places) => {
    expect(parseDecimal(raw, places)).toBeNull();
  });
});

describe("mapSettingsToForm", () => {
  it("shows money as typed and an absent threshold as an empty field", () => {
    const values = mapSettingsToForm({ ...SETTINGS, courierFreeFrom: null });
    expect(values.courierPrice).toBe("150");
    expect(values.courierFreeFrom).toBe("");
    expect(values.defaultWeightKg).toBe("0.5");
  });

  it("names the saved branch only when its label is known", () => {
    expect(mapSettingsToForm(SETTINGS).senderWarehouseName).toBe("");
    expect(
      mapSettingsToForm(SETTINGS, "Відділення №1").senderWarehouseName,
    ).toBe("Відділення №1");
    expect(
      mapSettingsToForm({ ...SETTINGS, senderWarehouseRef: null }, "stale")
        .senderWarehouseName,
    ).toBe("");
  });
});

describe("deliverySettingsSchema", () => {
  it("accepts the saved settings", () => {
    expect(messagesOf(valuesWith({}))).toEqual({});
  });

  it("requires the courier city and price only while the courier is on", () => {
    const blank = { courierCityName: "", courierPrice: "" };
    expect(messagesOf(valuesWith(blank))).toEqual({
      courierCityName: e.courierCityRequired,
      courierPrice: e.priceRequired,
    });
    expect(messagesOf(valuesWith({ ...blank, courierEnabled: false }))).toEqual(
      {},
    );
  });

  it("refuses a malformed price or threshold", () => {
    expect(
      messagesOf(valuesWith({ courierPrice: "12.345", courierFreeFrom: "x" })),
    ).toEqual({
      courierPrice: e.moneyInvalid,
      courierFreeFrom: e.moneyInvalid,
    });
  });

  it("refuses a typed sender city that was never picked from the directory", () => {
    expect(
      messagesOf(valuesWith({ senderCityRef: "", senderCityName: "Ки" })),
    ).toEqual({ senderCityName: e.senderCityPick });
  });

  it("holds the weight to NP's 0.1–30 kg, only while NP is on", () => {
    expect(messagesOf(valuesWith({ defaultWeightKg: "50" }))).toEqual({
      defaultWeightKg: e.weightInvalid,
    });
    expect(
      messagesOf(valuesWith({ defaultWeightKg: "50", npEnabled: false })),
    ).toEqual({});
  });
});

describe("deliverySettingsFormToDto", () => {
  it("sends numbers, the flags and the dispatch pair", () => {
    expect(deliverySettingsFormToDto(valuesWith({}))).toEqual({
      npEnabled: true,
      pickupEnabled: false,
      courierEnabled: true,
      otherEnabled: true,
      senderCityRef: "city-kyiv",
      senderCityName: "Київ, Київська обл.",
      senderWarehouseRef: "wh-1",
      defaultWeightKg: 0.5,
      courierCityName: "Київ",
      courierPrice: 150,
      courierFreeFrom: 2000,
    });
  });

  it("sends an empty «Безкоштовно від» as null — the API drops the threshold", () => {
    expect(
      deliverySettingsFormToDto(valuesWith({ courierFreeFrom: "  " }))
        .courierFreeFrom,
    ).toBeNull();
  });

  it("reads a decimal comma", () => {
    const dto = deliverySettingsFormToDto(
      valuesWith({ courierPrice: "99,5", defaultWeightKg: "1,25" }),
    );
    expect(dto.courierPrice).toBe(99.5);
    expect(dto.defaultWeightKg).toBe(1.25);
  });

  it("leaves out a number it cannot read rather than sending garbage", () => {
    const dto = deliverySettingsFormToDto(
      valuesWith({ courierEnabled: false, courierPrice: "дорого" }),
    );
    expect(dto).not.toHaveProperty("courierPrice");
  });

  it("clears the dispatch city as a pair when nothing is picked", () => {
    const dto = deliverySettingsFormToDto(
      valuesWith({ senderCityRef: "", senderCityName: "" }),
    );
    expect(dto).toMatchObject({
      senderCityRef: "",
      senderCityName: "",
      senderWarehouseRef: "",
    });
  });

  it("sends a blank courier city as null", () => {
    expect(
      deliverySettingsFormToDto(valuesWith({ courierCityName: " " }))
        .courierCityName,
    ).toBeNull();
  });
});
