import { z } from "zod";
import {
  RESTOCK_ON_STATUS,
  type ResolveReturnDto,
  type ReturnItemEntity,
} from "@/entities/return";
import { dict } from "@/shared/config";
import { formatCurrency, nullableTextField } from "@/shared/lib";

const t = dict.returns;

/** Same ceiling as `ResolveReturnDto.operatorNotes` (`@MaxLength(2000)`). */
export const OPERATOR_NOTES_MAX_LENGTH = 2000;

const REFUND_AMOUNT_RE = /^\d{1,8}(\.\d{1,2})?$/;

/** Decimal string → integer kopiykas, the way the API compares money. */
function toCents(value: string): number {
  return Math.round(parseFloat(value) * 100);
}

function centsToString(cents: number): string {
  return `${Math.floor(cents / 100)}.${(cents % 100).toString().padStart(2, "0")}`;
}

/**
 * The two ceilings the API puts on `refundedAmount` (TASK-785), as decimal
 * strings. Either may be absent — an absent bound is not checked here, and the
 * server still enforces it.
 */
export interface RefundCeilings {
  /** What the lines coming back are worth — see {@link returnedValueOf}. */
  readonly returnedValue?: string | null;
  /** What the order still has to give back — see {@link orderBalanceOf}. */
  readonly orderBalance?: string | null;
}

/**
 * Ceiling (1): Σ unit price × quantity over this return's lines.
 *
 * The GROSS line value, exactly as `assertRefundWithinCeilings` in the API
 * computes it: the order's discount is stored once on the order and never split
 * across lines, so there is no per-line net price to use — ceiling (2) is what
 * enforces the discount. Add-ons and shipping are left out.
 *
 * `null` when a line has no price. The admin response always joins the order
 * line, so that should not happen; guessing a bound the server does not use
 * would refuse amounts it accepts.
 */
export function returnedValueOf(
  items: ReadonlyArray<Pick<ReturnItemEntity, "price" | "quantity">>,
): string | null {
  let cents = 0;
  for (const item of items) {
    if (item.price === null) return null;
    cents += toCents(item.price) * item.quantity;
  }
  return centsToString(cents);
}

/**
 * Ceiling (2): `order.total` less what the order's OTHER returns recorded as
 * refunded, floored at zero.
 *
 * Every other return counts whatever its status — REJECTED included, because
 * money recorded as paid out is gone either way — and a null amount counts as
 * zero. The return being resolved is NOT in `otherRefunds`: its old amount is
 * the one being replaced.
 */
export function orderBalanceOf(
  orderTotal: string,
  otherRefunds: ReadonlyArray<string | null>,
): string {
  const refunded = otherRefunds.reduce(
    (sum, amount) => sum + (amount === null ? 0 : toCents(amount)),
    0,
  );
  return centsToString(Math.max(toCents(orderTotal) - refunded, 0));
}

/**
 * «Можна повернути максимум» (TASK-959, ReturnsProposal Р3–Р5): the lower of
 * the ceilings this card knows, or `null` when it knows neither. With only
 * the returned value known it is that value — the server may still refuse
 * less if the order balance is lower, and its 400 is put under the field.
 */
export function refundCapOf(ceilings: RefundCeilings): string | null {
  const known = [ceilings.returnedValue, ceilings.orderBalance].filter(
    (value): value is string => value != null,
  );
  if (known.length === 0) return null;
  return centsToString(Math.min(...known.map(toCents)));
}

/**
 * The operator's decision on a return (TASK-340).
 *
 * `refundedAmount` is a decimal STRING, matching the backend's `@Matches`
 * pattern, for the reason every money field in this project is a string: a float
 * cannot hold 0.10, and nobody notices until the day's totals disagree by a
 * kopiyka. It is validated here rather than left to a 400 so the operator finds
 * out while the number is still under their cursor.
 *
 * The ceilings mirror the API's rule (TASK-785): compared in integer kopiykas,
 * the returned value first, so `49900` typed for `499.00` is refused under the
 * field instead of flowing into the refund totals. An empty field is never
 * checked — it clears the amount, and clearing a mistyped one must stay possible.
 */
export function createResolveReturnSchema(ceilings: RefundCeilings = {}) {
  const { returnedValue, orderBalance } = ceilings;

  return z.object({
    status: z.string().min(1),
    operatorNotes: z
      .string()
      .trim()
      .max(OPERATOR_NOTES_MAX_LENGTH, t.operatorNotesTooLong),
    refundedAmount: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        if (value === "") return;

        if (!REFUND_AMOUNT_RE.test(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t.resolveRefundedAmountInvalid,
          });
          return;
        }

        const requested = toCents(value);
        if (returnedValue != null && requested > toCents(returnedValue)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t.resolveRefundExceedsReturnedValue(
              formatCurrency(returnedValue),
            ),
          });
          return;
        }
        if (orderBalance != null && requested > toCents(orderBalance)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t.resolveRefundExceedsOrderBalance(
              formatCurrency(orderBalance),
            ),
          });
        }
      }),
    restock: z.boolean(),
  });
}

/** No ceilings: the shape and the format rules only. */
export const resolveReturnSchema = createResolveReturnSchema();

export type ResolveReturnFormValues = z.infer<typeof resolveReturnSchema>;

/**
 * Whether crediting the goods back to sellable stock is even a question.
 *
 * Only at RECEIVED, and only once. The backend refuses anything else, but the
 * checkbox is hidden rather than merely refused: an operator ticking a box that
 * cannot apply is being invited to believe stock came back when it did not.
 */
export function canRestock(
  targetStatus: string,
  alreadyRestockedAt: string | null,
): boolean {
  return targetStatus === RESTOCK_ON_STATUS && alreadyRestockedAt === null;
}

/**
 * Map the form to the PATCH body.
 *
 * `restock` is sent only when it is true AND applicable. Sending `false`
 * explicitly would be harmless today, but the flag means "credit the stock now",
 * and a request that carries it on a REFUNDED transition reads like an intent
 * the operator never had.
 */
export function resolveValuesToDto(
  values: ResolveReturnFormValues,
  alreadyRestockedAt: string | null,
): ResolveReturnDto {
  const restock =
    values.restock && canRestock(values.status, alreadyRestockedAt);

  return {
    status: values.status as ResolveReturnDto["status"],
    // See `nullableTextField` for why these two need a cast: the backend DTO
    // declares them `nullable` with no explicit `type`, so Orval widens them.
    operatorNotes: nullableTextField<ResolveReturnDto["operatorNotes"]>(
      values.operatorNotes,
    ),
    refundedAmount: nullableTextField<ResolveReturnDto["refundedAmount"]>(
      values.refundedAmount,
    ),
    ...(restock ? { restock: true } : {}),
  };
}
