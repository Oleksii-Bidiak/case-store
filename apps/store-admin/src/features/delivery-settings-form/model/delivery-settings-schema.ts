import { z } from "zod";
import type {
  DeliverySettingDto,
  UpdateDeliverySettingDto,
} from "@/entities/delivery";
import { dict } from "@/shared/config";

const e = dict.deliverySettingsForm.errors;

/** NP's own bounds for a standard parcel — the API's `@Min(0.1) @Max(30)`. */
export const WEIGHT_MIN_KG = 0.1;
export const WEIGHT_MAX_KG = 30;
/** The API's `@Max(100000)` on the courier price and threshold. */
export const MONEY_MAX = 100_000;

/**
 * A decimal the operator typed — «150», «0,5», « 2 000 » — as a number, or
 * `null` when it is not one. Spaces go (uk-UA groups thousands with them) and a
 * decimal comma is read as a point, so what the field accepts is what a
 * Ukrainian keyboard produces. At most `maxDecimals` places, like the API's
 * `IsNumber({ maxDecimalPlaces })`.
 */
export function parseDecimal(raw: string, maxDecimals: number): number | null {
  const text = raw.replace(/\s/g, "").replace(",", ".");
  if (text === "") return null;
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$`);
  if (!pattern.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

const parseMoney = (raw: string): number | null => {
  const value = parseDecimal(raw, 2);
  return value !== null && value <= MONEY_MAX ? value : null;
};

const parseWeight = (raw: string): number | null => {
  const value = parseDecimal(raw, 3);
  return value !== null && value >= WEIGHT_MIN_KG && value <= WEIGHT_MAX_KG
    ? value
    : null;
};

/**
 * The /settings/delivery form (TASK-644).
 *
 * Every field is a string or a boolean — what the inputs hold — and the numbers
 * are made in {@link deliverySettingsFormToDto}. A field is checked ONLY while
 * its method is switched on: the body of a switched-off card is not on screen,
 * and an error the operator cannot see is a «Зберегти» that silently does
 * nothing.
 *
 * `senderWarehouseName` is form-only — the API stores the branch ref without
 * its name (`DeliverySettingDto` has no `senderWarehouseName`), so the label is
 * whatever the picker last showed.
 */
export const deliverySettingsSchema = z
  .object({
    npEnabled: z.boolean(),
    pickupEnabled: z.boolean(),
    courierEnabled: z.boolean(),
    otherEnabled: z.boolean(),
    senderCityRef: z.string(),
    senderCityName: z.string(),
    senderWarehouseRef: z.string(),
    senderWarehouseName: z.string(),
    defaultWeightKg: z.string(),
    courierCityName: z.string(),
    courierPrice: z.string(),
    courierFreeFrom: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.npEnabled) {
      // Typed but never picked: there is no ref to estimate from.
      if (values.senderCityName.trim() !== "" && values.senderCityRef === "") {
        ctx.addIssue({
          code: "custom",
          path: ["senderCityName"],
          message: e.senderCityPick,
        });
      }
      if (
        values.senderWarehouseName.trim() !== "" &&
        values.senderWarehouseRef === ""
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["senderWarehouseName"],
          message: e.senderWarehousePick,
        });
      }
      if (parseWeight(values.defaultWeightKg) === null) {
        ctx.addIssue({
          code: "custom",
          path: ["defaultWeightKg"],
          message: e.weightInvalid,
        });
      }
    }

    if (values.courierEnabled) {
      if (values.courierCityName.trim() === "") {
        ctx.addIssue({
          code: "custom",
          path: ["courierCityName"],
          message: e.courierCityRequired,
        });
      }
      if (values.courierPrice.trim() === "") {
        ctx.addIssue({
          code: "custom",
          path: ["courierPrice"],
          message: e.priceRequired,
        });
      } else if (parseMoney(values.courierPrice) === null) {
        ctx.addIssue({
          code: "custom",
          path: ["courierPrice"],
          message: e.moneyInvalid,
        });
      }
      if (
        values.courierFreeFrom.trim() !== "" &&
        parseMoney(values.courierFreeFrom) === null
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["courierFreeFrom"],
          message: e.moneyInvalid,
        });
      }
    }
  });

export type DeliverySettingsFormValues = z.infer<typeof deliverySettingsSchema>;

/**
 * Every validated field, in the order the screen shows them — the order a
 * blocked submit walks to find the field to focus (forms.md Rule 4a).
 */
export const DELIVERY_FIELD_ORDER = [
  "senderCityName",
  "senderWarehouseName",
  "defaultWeightKg",
  "courierCityName",
  "courierPrice",
  "courierFreeFrom",
] as const satisfies readonly (keyof DeliverySettingsFormValues)[];

/** Which card each field belongs to — what «Незбережені зміни: …» names. */
export const DELIVERY_SECTIONS = {
  np: [
    "npEnabled",
    "senderCityRef",
    "senderCityName",
    "senderWarehouseRef",
    "senderWarehouseName",
    "defaultWeightKg",
  ],
  pickup: ["pickupEnabled"],
  courier: [
    "courierEnabled",
    "courierCityName",
    "courierPrice",
    "courierFreeFrom",
  ],
  other: ["otherEnabled"],
} as const satisfies Record<
  string,
  readonly (keyof DeliverySettingsFormValues)[]
>;

export type DeliverySectionKey = keyof typeof DELIVERY_SECTIONS;

/** «150.00» → «150», «29.90» → «29.9»: the number as an operator would type it. */
function moneyToField(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? String(amount) : value;
}

/**
 * The fetched settings onto the form. `warehouseLabel` is the branch name the
 * picker knows for `senderWarehouseRef` (the API does not send one) — `""` when
 * it is not known, and the field then says the branch came from the directory.
 */
export function mapSettingsToForm(
  settings: DeliverySettingDto,
  warehouseLabel = "",
): DeliverySettingsFormValues {
  return {
    npEnabled: settings.npEnabled,
    pickupEnabled: settings.pickupEnabled,
    courierEnabled: settings.courierEnabled,
    otherEnabled: settings.otherEnabled,
    senderCityRef: settings.senderCityRef ?? "",
    senderCityName: settings.senderCityName ?? "",
    senderWarehouseRef: settings.senderWarehouseRef ?? "",
    senderWarehouseName: settings.senderWarehouseRef ? warehouseLabel : "",
    defaultWeightKg: String(settings.defaultWeightKg),
    courierCityName: settings.courierCityName ?? "",
    courierPrice: moneyToField(settings.courierPrice),
    courierFreeFrom:
      settings.courierFreeFrom === null
        ? ""
        : moneyToField(settings.courierFreeFrom),
  };
}

/**
 * The form onto the PUT body. The flags always go; a number goes only when it
 * parses — a switched-off card is not validated (see the schema), so a
 * half-typed price there is left out rather than sent as garbage. An empty
 * «Безкоштовно від» is `null`: the API removes the threshold.
 *
 * The dispatch city goes as a pair. Without a picked ref both are sent empty —
 * the API's origin chain treats an empty ref as unset and falls back to the
 * env/Kyiv default, which is how a cleared field takes effect.
 */
export function deliverySettingsFormToDto(
  values: DeliverySettingsFormValues,
): UpdateDeliverySettingDto {
  const dto: UpdateDeliverySettingDto = {
    npEnabled: values.npEnabled,
    pickupEnabled: values.pickupEnabled,
    courierEnabled: values.courierEnabled,
    otherEnabled: values.otherEnabled,
    courierCityName: values.courierCityName.trim() || null,
  };

  if (values.senderCityRef !== "") {
    dto.senderCityRef = values.senderCityRef;
    dto.senderCityName = values.senderCityName.trim();
    dto.senderWarehouseRef = values.senderWarehouseRef;
  } else {
    dto.senderCityRef = "";
    dto.senderCityName = "";
    dto.senderWarehouseRef = "";
  }

  const weight = parseWeight(values.defaultWeightKg);
  if (weight !== null) dto.defaultWeightKg = weight;

  const price = parseMoney(values.courierPrice);
  if (price !== null) dto.courierPrice = price;

  if (values.courierFreeFrom.trim() === "") {
    dto.courierFreeFrom = null;
  } else {
    const threshold = parseMoney(values.courierFreeFrom);
    if (threshold !== null) dto.courierFreeFrom = threshold;
  }

  return dto;
}

export { parseMoney };
