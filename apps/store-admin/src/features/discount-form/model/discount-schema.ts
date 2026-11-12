import { z } from "zod";
import type { CreateDiscountDto, UpdateDiscountDto } from "@/entities/discount";
import { dict } from "@/shared/config";
import { fromKyivDateEnd, fromKyivDateStart } from "@/shared/lib";
import { parseKop } from "@/shared/lib/money-kop";

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
 * "no cap". A `0` gets its own words (DiscountsProposal ПК4): it reads like
 * "no limit" and means "nobody".
 */
const isZero = (v: string) => /^0+$/.test(v);
const optionalIntString = (message: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => v === undefined || v === "" || !isZero(v), e.capZero)
    .refine(
      (v) =>
        v === undefined ||
        v === "" ||
        isZero(v) ||
        (/^\d+$/.test(v) && Number(v) >= 1),
      message,
    )
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v)));

/**
 * At most two digits after the decimal point — the API validates money with
 * `@IsNumber({ maxDecimalPlaces: 2 })` (TASK-796).
 */
const hasAtMostTwoDecimals = (v: string | undefined) =>
  v === undefined || !/[.,]\d{3,}/.test(v);

/**
 * The DTO's `@MaxLength(64)` on `code`
 * (`apps/store-api/src/discount/dto/create-discount.dto.ts`) — read by the
 * schema and by the input's `maxLength` (TASK-1984, Rule 5d).
 */
export const DISCOUNT_CODE_MAX_LENGTH = 64;

const isNegative = (v: string) => v.trim().startsWith("-");

/**
 * A money field judged by the admin's money parser (TASK-1984, Rule 5e), never
 * by `Number(x)` alone: `Infinity`, `1e400` and `1e3` are not amounts. Checked
 * in the order the operator should read them: decimals, sign, shape, `> 0`.
 *
 * Stricter on purpose (Rule 5f): the parser's ceiling is `int4` kopecks,
 * 21 474 836,47 ₴, below the DTO's `@Max(DISCOUNT_MONEY_MAX)` (99 999 999,99,
 * the column's `Decimal(10, 2)`). No promo code or minimum spend comes near
 * either, and one money parser across the panel beats a second one for this form.
 */
const moneyIssue = (v: string, { positive }: { positive: boolean }) => {
  if (!hasAtMostTwoDecimals(v)) return e.decimalsMax;
  if (isNegative(v)) return positive ? e.valuePositive : e.minSpendInvalid;
  const kop = parseKop(v);
  if (kop === null) return e.amountInvalid;
  if (positive && kop <= 0) return e.valuePositive;
  return null;
};

/** Kopecks → the UAH number the DTO takes (`@IsNumber({ maxDecimalPlaces: 2 })`). */
const toUah = (v: string) => (parseKop(v) ?? 0) / 100;

/** Both are `YYYY-MM-DD`, which orders lexicographically — no zone needed. */
const windowInOrder = (data: { startsAt?: string; expiresAt?: string }) =>
  !data.startsAt || !data.expiresAt || data.startsAt <= data.expiresAt;

export const discountSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, e.codeRequired)
      .max(DISCOUNT_CODE_MAX_LENGTH, e.codeMax)
      .transform((v) => v.toUpperCase()),

    type: z.enum(["PERCENT", "FIXED"]),

    value: z
      .string()
      .trim()
      .min(1, e.valueRequired)
      .superRefine((v, ctx) => {
        const message = moneyIssue(v, { positive: true });
        if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      })
      .transform(toUah),

    minSpend: z
      .string()
      .trim()
      .optional()
      .superRefine((v, ctx) => {
        if (v === undefined || v === "") return;
        const message = moneyIssue(v, { positive: false });
        if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      })
      .transform((v) => (v === undefined || v === "" ? undefined : toUah(v))),

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
  // A reversed window is wrong at BOTH ends (ПК4): both fields are marked, the
  // form says the reason once under the pair.
  .refine(windowInOrder, { path: ["startsAt"], message: e.dateOrder })
  .refine(windowInOrder, { path: ["expiresAt"], message: e.dateOrder });

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
