import { z } from "zod";
import type { OrderEntity, UpdateOrderDetailsDto } from "@/entities/order";
import { dict } from "@/shared/config";
import {
  apiErrorMessage,
  apiErrorStatus,
  nullableTextField,
} from "@/shared/lib";

const t = dict.orders;

/** Digits in a Nova Poshta waybill (ТТН). Fourteen, always — NP issues no other length. */
export const WAYBILL_DIGITS = 14;

/**
 * The characters a human legitimately types AROUND the digits of a waybill.
 * Mirrors `NP_WAYBILL_SHAPE` in the API's `is-np-waybill.decorator.ts`, which is
 * what will actually judge the value.
 */
const WAYBILL_SHAPE = /^[\d\s-]+$/;

/**
 * Whether `raw` is a Nova Poshta waybill — the admin mirror of the API's
 * `@IsNovaPoshtaWaybill` (TASK-426).
 *
 * Counts DIGITS, not characters, because a ТТН is copy-pasted out of the
 * courier's interface far more often than it is typed: `2045 0000 0000 01` and
 * `20450000000001` are one parcel written two ways, while `--------------` is
 * fourteen characters and no waybill at all.
 */
export function isValidWaybill(raw: string): boolean {
  const trimmed = raw.trim();
  if (!WAYBILL_SHAPE.test(trimmed)) return false;

  return trimmed.replace(/\D/g, "").length === WAYBILL_DIGITS;
}

/**
 * The two operator-editable fields that are not part of the order's lifecycle
 * (TASK-335 waybill, TASK-336 internal notes).
 *
 * Both are blank-to-clear: an empty box means "there is no waybill / no note",
 * which the API expresses as an explicit `null`. That is NOT the same as omitting
 * the key, which means "leave it alone" — and since TASK-426 the mapper uses both
 * meanings deliberately. See {@link orderDetailsValuesToDto}.
 *
 * ── Why this is a factory (TASK-426) ─────────────────────────────────────────
 * The rule the API enforces is "exactly 14 digits", and orders created before it
 * existed carry values that are not: a short number typed under TASK-335, or
 * «ТТН уточнюється». A flat 14-digit rule would mark such an order's form invalid
 * the moment it loads, and the operator could then never save its INTERNAL NOTES
 * — a field they can edit, on a value they never touched.
 *
 * So the seeded value is grandfathered: the rule judges what the operator TYPES,
 * not what the order already had. An untouched legacy value stays valid on
 * screen, and the mapper does not send it (so the API never sees it either);
 * changing it at all means the new value must be a real waybill.
 *
 * @param seededTrackingNumber the waybill as the order currently carries it
 *   (`""` when it has none).
 */
export function createOrderDetailsSchema(seededTrackingNumber: string) {
  const grandfathered = seededTrackingNumber.trim();

  return z.object({
    trackingNumber: z
      .string()
      .trim()
      .max(64, t.trackingNumberInvalid)
      .refine(
        (value) =>
          // Blank stays valid: a waybill is assigned later, and clearing one the
          // operator saved by mistake must remain possible.
          value === "" ||
          (grandfathered !== "" && value === grandfathered) ||
          isValidWaybill(value),
        { message: t.trackingNumberInvalid },
      ),
    internalNotes: z.string().trim().max(2000, t.internalNotesInvalid),
  });
}

export type OrderDetailsFormValues = z.infer<
  ReturnType<typeof createOrderDetailsSchema>
>;

/** Seed the form from the order. Nulls become empty strings — RHF wants
 *  controlled string inputs, and `null` in a text box is a React warning. */
export function mapOrderToDetailsValues(
  order: Pick<OrderEntity, "trackingNumber" | "internalNotes">,
): OrderDetailsFormValues {
  return {
    trackingNumber: order.trackingNumber ?? "",
    internalNotes: order.internalNotes ?? "",
  };
}

/**
 * Map the form to the PATCH body, carrying the optimistic-lock token.
 *
 * `expectedUpdatedAt` is threaded through here rather than being optional
 * plumbing at the call site: a details write is the other half of edge case
 * E-11, and an operator who overwrites a colleague's waybill with their own has
 * lost exactly as much as one who overwrote a status.
 *
 * ── Why the waybill is sent only when it CHANGED (TASK-426) ──────────────────
 * It used to be sent on every save. Then the API learned that a ТТН is exactly 14
 * digits, and every order carrying a legacy value — a short number, or «ТТН
 * уточнюється» — started answering 400 to a save of its INTERNAL NOTES: a field
 * the operator was editing, rejected over a field they never touched.
 *
 * An omitted key means "leave it alone" (`order.repository.ts` builds its Prisma
 * `data` from the keys that are present), which is exactly the truth here. The
 * blank-to-clear contract survives: clearing a value IS a change, so `null` is
 * sent and the field is cleared.
 *
 * @param seeded the values the form was seeded with, i.e. what the order carries
 *   now. Passed in rather than remembered in state — there is no state to get out
 *   of sync (docs/conventions/forms.md), and the caller already derives it for
 *   RHF's `values`.
 */
export function orderDetailsValuesToDto(
  values: OrderDetailsFormValues,
  seeded: OrderDetailsFormValues,
  expectedUpdatedAt: string,
): UpdateOrderDetailsDto {
  const trackingChanged =
    values.trackingNumber.trim() !== seeded.trackingNumber.trim();

  return {
    // `nullableTextField` is a cast, not a conversion — see its docblock for the
    // upstream Swagger artifact that makes these two fields arrive in the
    // generated client typed as objects rather than strings.
    ...(trackingChanged
      ? {
          trackingNumber: nullableTextField<
            UpdateOrderDetailsDto["trackingNumber"]
          >(values.trackingNumber),
        }
      : {}),
    internalNotes: nullableTextField<UpdateOrderDetailsDto["internalNotes"]>(
      values.internalNotes,
    ),
    expectedUpdatedAt,
  };
}

/**
 * Did the API refuse this save because of the WAYBILL specifically?
 *
 * The generic «не вдалося зберегти» is the right answer to a failure nobody can
 * act on, and the wrong one here: the server named a field and a rule, and the
 * operator needs both to fix it. `class-validator` answers with
 * `message: string[]` carrying the English constraint text, which must never
 * reach an operator — so we look for the field it names and say the rule in our
 * own words (`dict.orders.detailsFailedTracking`).
 */
export function isWaybillRejection(error: unknown): boolean {
  if (apiErrorStatus(error) !== 400) return false;

  return /waybill|trackingnumber|ттн/i.test(apiErrorMessage(error) ?? "");
}
