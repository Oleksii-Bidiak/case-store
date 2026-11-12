import { z } from "zod";
import { dict } from "@/shared/config";
import { phoneField } from "@/shared/lib/phone-field";
import type {
  AdminPickupPointDto,
  CreatePickupPointDto,
} from "@/entities/delivery";

const e = dict.pickupPointForm.errors;

/**
 * The API's own limits (`pickup-point-admin.dto.ts`). Mirrored so an
 * over-long value is refused next to its field instead of as a bare 400.
 */
export const PICKUP_POINT_LIMITS = {
  name: 255,
  city: 255,
  address: 500,
  phone: 50,
  workingHours: 255,
  mapUrl: 2048,
} as const;

/** An http(s) URL the API's `@IsUrl({ require_protocol })` will accept. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.includes(".")
    );
  } catch {
    return false;
  }
}

const required = (message: string, max: number) =>
  z.string().trim().min(1, message).max(max, e.tooLong(max));

const optional = (max: number) => z.string().trim().max(max, e.tooLong(max));

/**
 * ДН-1.4: name, city and address are what the buyer needs to find the point,
 * so they are required; the phone, hours and map link are optional. The map
 * link is opened from the order e-mail, so only an http(s) address passes —
 * the API refuses anything else (a `javascript:` link there would be an XSS
 * vector, not a typo).
 */
export const pickupPointSchema = z.object({
  name: required(e.nameRequired, PICKUP_POINT_LIMITS.name),
  city: required(e.cityRequired, PICKUP_POINT_LIMITS.city),
  address: required(e.addressRequired, PICKUP_POINT_LIMITS.address),
  // TASK-1984 (Rule 5a): the DTO is `@IsInternationalPhone` — the shop's own
  // number, so a 0 800 or foreign line passes; stored as typed. Letters
  // (`222фіфів`) are refused under the field.
  phone: optional(PICKUP_POINT_LIMITS.phone).pipe(
    phoneField({ rule: "international", optional: true }),
  ),
  workingHours: optional(PICKUP_POINT_LIMITS.workingHours),
  mapUrl: optional(PICKUP_POINT_LIMITS.mapUrl).refine(
    (value) => value === "" || isHttpUrl(value),
    e.mapUrlInvalid,
  ),
  isActive: z.boolean(),
});

export type PickupPointFormValues = z.infer<typeof pickupPointSchema>;

/** DTO path → form field for a server 400 (Rule 6b): the names are the same. */
export const PICKUP_POINT_FIELD_MAP = {
  name: "name",
  city: "city",
  address: "address",
  phone: "phone",
  workingHours: "workingHours",
  mapUrl: "mapUrl",
} as const;

/** A new point (forms.md Rule 4c: every validated field has a default). */
export const EMPTY_PICKUP_POINT: PickupPointFormValues = {
  name: "",
  city: "",
  address: "",
  phone: "",
  workingHours: "",
  mapUrl: "",
  isActive: true,
};

export function mapPickupPointToForm(
  point: AdminPickupPointDto,
): PickupPointFormValues {
  return {
    name: point.name,
    city: point.city,
    address: point.address,
    phone: point.phone ?? "",
    workingHours: point.workingHours ?? "",
    mapUrl: point.mapUrl ?? "",
    isActive: point.isActive,
  };
}

const orNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * The body for both POST and PUT. Every field is sent, so a cleared phone or
 * map link is stored as cleared (`null`), not left as it was.
 */
export function pickupPointFormToDto(
  values: PickupPointFormValues,
): CreatePickupPointDto {
  return {
    name: values.name.trim(),
    city: values.city.trim(),
    address: values.address.trim(),
    phone: orNull(values.phone),
    workingHours: orNull(values.workingHours),
    mapUrl: orNull(values.mapUrl),
    isActive: values.isActive,
  };
}
