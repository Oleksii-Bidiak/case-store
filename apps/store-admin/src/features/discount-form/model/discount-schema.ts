import { z } from "zod";
import type { CreateDiscountDto, UpdateDiscountDto } from "@/entities/discount";
import { dict } from "@/shared/config";

const e = dict.discountForm.errors;

/**
 * Validation schema for the admin discount form.
 *
 * Numeric and date fields are modelled as strings on the INPUT side (bound to
 * text/number/date inputs) and parsed on the OUTPUT side, so `react-hook-form`
 * registration stays string-only while `onSubmit` receives parsed values. The
 * PERCENT 1–100 bound and the start/expiry ordering are enforced here (mirroring
 * the server's `assertValidDefinition`), with the server as the final arbiter.
 */
const optionalIntString = (message: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => v === undefined || v === "" || /^\d+$/.test(v), message)
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v)));

export const discountSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, e.codeRequired)
      .max(64, e.codeMax)
      .transform((v) => v.toUpperCase()),

    type: z.enum(["PERCENT", "FIXED"]),

    value: z
      .string()
      .trim()
      .min(1, e.valueRequired)
      .refine((v) => Number(v) > 0, e.valuePositive)
      .transform((v) => Number(v)),

    minSpend: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) => v === undefined || v === "" || Number(v) >= 0,
        e.minSpendInvalid,
      )
      .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),

    maxRedemptions: optionalIntString(e.intInvalid),
    perUserLimit: optionalIntString(e.intInvalid),

    startsAt: z.string().trim().optional(),
    expiresAt: z.string().trim().optional(),

    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => data.type !== "PERCENT" || (data.value >= 1 && data.value <= 100),
    { path: ["value"], message: e.percentRange },
  )
  .refine(
    (data) =>
      !data.startsAt ||
      !data.expiresAt ||
      new Date(data.startsAt) <= new Date(data.expiresAt),
    { path: ["expiresAt"], message: e.dateOrder },
  );

export type DiscountFormInput = z.input<typeof discountSchema>;
export type DiscountFormValues = z.output<typeof discountSchema>;

/**
 * Map parsed form values to a create/update payload. Blank optional fields are
 * dropped on create (backend stores null) and sent as `null` on update so an
 * admin can explicitly clear a previously-set cap/window. Date strings are
 * widened to ISO datetimes (`YYYY-MM-DD` → start of day UTC) for the API.
 */
export function discountFormValuesToDto(
  values: DiscountFormValues,
): CreateDiscountDto;
export function discountFormValuesToDto(
  values: DiscountFormValues,
  options: { isUpdate: true },
): UpdateDiscountDto;
export function discountFormValuesToDto(
  values: DiscountFormValues,
  options: { isUpdate?: boolean } = {},
): CreateDiscountDto | UpdateDiscountDto {
  const toIso = (date?: string): string | null | undefined => {
    if (!date) return options.isUpdate ? null : undefined;
    return new Date(date).toISOString();
  };
  const orClear = <T>(v: T | undefined): T | null | undefined =>
    v === undefined ? (options.isUpdate ? null : undefined) : v;

  return {
    code: values.code,
    type: values.type,
    value: values.value,
    minSpend: orClear(values.minSpend),
    maxRedemptions: orClear(values.maxRedemptions),
    perUserLimit: orClear(values.perUserLimit),
    startsAt: toIso(values.startsAt),
    expiresAt: toIso(values.expiresAt),
    isActive: values.isActive,
  } as CreateDiscountDto | UpdateDiscountDto;
}
