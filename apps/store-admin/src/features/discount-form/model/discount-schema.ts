import { z } from "zod";
import type { CreateDiscountDto, UpdateDiscountDto } from "@/entities/discount";
import { dict } from "@/shared/config";
import { fromKyivDateEnd, fromKyivDateStart } from "@/shared/lib";

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
/**
 * An optional positive-integer cap. `0` is rejected here (TASK-796): the API's
 * `@Min(1)` refuses it, and a form that lets it through only earns the operator
 * a generic "could not save" with no hint which field was wrong. Blank means
 * "no cap".
 */
const optionalIntString = (message: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => v === undefined || v === "" || (/^\d+$/.test(v) && Number(v) >= 1),
      message,
    )
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v)));

/**
 * At most two digits after the decimal point — the API validates money with
 * `@IsNumber({ maxDecimalPlaces: 2 })` (TASK-796).
 */
const hasAtMostTwoDecimals = (v: string | undefined) =>
  v === undefined || !/[.,]\d{3,}/.test(v);

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
      .refine(hasAtMostTwoDecimals, e.decimalsMax)
      .transform((v) => Number(v)),

    minSpend: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) => v === undefined || v === "" || Number(v) >= 0,
        e.minSpendInvalid,
      )
      .refine(hasAtMostTwoDecimals, e.decimalsMax)
      .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),

    maxRedemptions: optionalIntString(e.intInvalid),
    perUserLimit: optionalIntString(e.intInvalid),

    startsAt: z.string().trim().optional(),
    expiresAt: z.string().trim().optional(),

    isActive: z.boolean().optional(),
    showOnPromoPage: z.boolean().optional(),
  })
  .refine(
    (data) => data.type !== "PERCENT" || (data.value >= 1 && data.value <= 100),
    { path: ["value"], message: e.percentRange },
  )
  .refine(
    (data) =>
      !data.startsAt ||
      !data.expiresAt ||
      // Both are `YYYY-MM-DD`, which orders lexicographically — no zone needed.
      data.startsAt <= data.expiresAt,
    { path: ["expiresAt"], message: e.dateOrder },
  );

export type DiscountFormInput = z.input<typeof discountSchema>;
export type DiscountFormValues = z.output<typeof discountSchema>;

/**
 * Map parsed form values to a create/update payload. Blank optional fields are
 * dropped on create (backend stores null) and sent as `null` on update so an
 * admin can explicitly clear a previously-set cap/window. Date strings are
 * widened to ISO instants of the KYIV day: `startsAt` → 00:00:00.000 Kyiv,
 * `expiresAt` → 23:59:59.999 Kyiv (DST-safe, see `datetime-local.ts`).
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
  // A day typed into `<input type="date">` is a KYIV calendar day, and the
  // window is inclusive at both ends: the code works from 00:00 Kyiv on the
  // start day through 23:59:59.999 Kyiv on the end day (TASK-795). What stood
  // here was `new Date(date).toISOString()` — UTC midnight, i.e. 03:00 Kyiv —
  // so «Діє до 1 вересня» stopped working at 03:00 on 1 September.
  const toIso = (
    date: string | undefined,
    bound: (value: string) => Date | null,
  ): string | null | undefined => {
    const instant = date ? bound(date) : null;
    if (!instant) return options.isUpdate ? null : undefined;
    return instant.toISOString();
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
    startsAt: toIso(values.startsAt, fromKyivDateStart),
    expiresAt: toIso(values.expiresAt, fromKyivDateEnd),
    isActive: values.isActive,
    showOnPromoPage: values.showOnPromoPage,
  } as CreateDiscountDto | UpdateDiscountDto;
}
