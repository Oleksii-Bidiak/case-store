import { z } from "zod";
import type { OrderEntity, UpdateOrderDetailsDto } from "@/entities/order";
import { dict } from "@/shared/config";
import { nullableTextField } from "@/shared/lib";
import type {
  ServerFieldMap,
  ServerFieldMessages,
} from "@/shared/lib/form-errors";

const t = dict.orders;

/** Digits in a Nova Poshta waybill (ТТН). Fourteen, always — NP issues no other length. */
export const WAYBILL_DIGITS = 14;
/** `UpdateOrderDetailsDto.trackingNumber` — `@MaxLength(64)`. */
export const TRACKING_NUMBER_MAX_LENGTH = 64;
/** `UpdateOrderDetailsDto.internalNotes` — `@MaxLength(2000)`. */
export const INTERNAL_NOTES_MAX_LENGTH = 2000;

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
 * Nova Poshta's public tracking page for a waybill (wave 198, К1 «Відстежити на
 * сайті НП ↗»). The number is the PATH segment — NP's page stopped filling in
 * the old query-parameter form (TASK-1987). Digits only — the spaces an operator pastes are
 * not part of it; a value with no digits at all is no waybill, so `null`.
 */
export function npTrackingUrl(waybill: string): string | null {
  const digits = waybill.replace(/\D/g, "");
  return digits ? `https://novaposhta.ua/tracking/${digits}` : null;
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
      .max(TRACKING_NUMBER_MAX_LENGTH, t.trackingNumberInvalid)
      .refine(
        (value) =>
          // Blank stays valid: a waybill is assigned later, and clearing one the
          // operator saved by mistake must remain possible.
          value === "" ||
          (grandfathered !== "" && value === grandfathered) ||
          isValidWaybill(value),
        { message: t.trackingNumberInvalid },
      ),
    internalNotes: z
      .string()
      .trim()
      .max(INTERNAL_NOTES_MAX_LENGTH, t.internalNotesInvalid),
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
 * `UpdateOrderDetailsDto` path → field, for `applyServerFieldErrors` (TASK-1984
 * Rule 6b). The server names the field in `fieldErrors`; it used to be found
 * by a regex over the English `message` (`isWaybillRejection`).
 */
export const ORDER_DETAILS_FIELD_MAP: ServerFieldMap = {
  trackingNumber: "trackingNumber",
  internalNotes: "internalNotes",
};

/** Our wording of each field's rule, whichever constraint the server named. */
export const ORDER_DETAILS_FIELD_MESSAGES: ServerFieldMessages = {
  trackingNumber: t.trackingNumberInvalid,
  internalNotes: t.internalNotesInvalid,
};
