import type { DeliveryMethod } from "@/entities/delivery";
import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "@/shared/lib";
import type {
  AppliedServerFieldErrors,
  ServerFieldMap,
  ServerFieldMessages,
} from "@/shared/lib/form-errors";
import type { CreateOrderFormValues, DraftLine } from "./create-order-schema";

const t = dict.orderCreate;

/** What a refused create says, placed where the operator can act on it. */
export interface CreateOrderRefusal {
  /** productId → the sentence under that line (Н3). */
  lines: Record<string, string>;
  /**
   * The box in «Підсумок», or `null` when every part of the refusal already
   * sits under its field — the «Перевірте N полів» list then points at them,
   * and saying it a second time is the duplicate Rule 6c forbids.
   */
  summary: string | null;
}

type FormField = keyof CreateOrderFormValues;

/**
 * `CreateManualOrderDto` path → the form field it is about (forms convention
 * Rule 6b), for `applyServerFieldErrors`.
 *
 * - While «той самий клієнт» is ticked the recipient fields are not on screen:
 *   the `shippingAddress` name and phone came from the client block, so that is
 *   where their refusal goes.
 * - A pickup order's city and address are the point's.
 * - The walk-in's `contact.name` is the two client names joined; a refusal of
 *   it lands on the first.
 */
export function createOrderFieldMap(
  sameRecipient: boolean,
  deliveryMethod: DeliveryMethod,
): ServerFieldMap {
  const recipient: Record<"firstName" | "lastName" | "phone", FormField> =
    sameRecipient
      ? {
          firstName: "contactFirstName",
          lastName: "contactLastName",
          phone: "contactPhone",
        }
      : { firstName: "firstName", lastName: "lastName", phone: "phone" };
  const atPoint = deliveryMethod === "PICKUP";
  const city: FormField = atPoint ? "pickupPointId" : "city";
  const address1: FormField = atPoint ? "pickupPointId" : "address1";

  return {
    userId: "userId",
    "contact.name": "contactFirstName",
    "contact.phone": "contactPhone",
    "contact.email": "contactEmail",
    "shippingAddress.firstName": recipient.firstName,
    "shippingAddress.lastName": recipient.lastName,
    "shippingAddress.phone": recipient.phone,
    "shippingAddress.city": city,
    "shippingAddress.npCityRef": city,
    "shippingAddress.address1": address1,
    "shippingAddress.npWarehouseRef": address1,
    "shippingAddress.npWarehouseName": address1,
    "shippingAddress.postalCode": "postalCode",
    pickupPointId: "pickupPointId",
    shippingCost: "shippingCost",
    notes: "notes",
    internalNotes: "internalNotes",
  };
}

/** Our wording of the note limits (TASK-794), whatever constraint failed. */
export const CREATE_ORDER_FIELD_MESSAGES: ServerFieldMessages = {
  notes: t.notesTooLong,
  internalNotes: t.internalNotesTooLong,
};

/**
 * Read a 400 from `POST /admin/orders` (TASK-957 / 958, wave 198 Н3) once its
 * `fieldErrors` have been put under the fields (`placed`, from
 * `applyServerFieldErrors` with {@link createOrderFieldMap}).
 *
 * What is left is placed here: a product the server names (by the name the
 * operator picked, in quotes) gets its sentence under that line; a `DELIVERY_*`
 * refusal is shown in the server's own (Ukrainian) words; anything nobody could
 * place keeps the generic «перевірте клієнта, товари та наявність».
 *
 * The stock / unavailable refusals carry no code yet, so they are still read
 * off the message — an API tail of TASK-1047. Field refusals never are.
 */
export function readCreateOrderRefusal(
  error: unknown,
  lines: readonly DraftLine[],
  placed: AppliedServerFieldErrors = { mapped: [], unmapped: [] },
): CreateOrderRefusal | null {
  if (apiErrorStatus(error) !== 400) return null;
  const message = apiErrorMessage(error) ?? "";

  // TASK-1021: the delivery refusals are the exception to "never shown" — the
  // API words them in Ukrainian for the person on the phone («…оберіть оплату
  // при отриманні або вкажіть місто Нової Пошти»), under a stable `DELIVERY_*`
  // code, so the sentence is shown as it came.
  if (apiErrorCode(error)?.startsWith("DELIVERY_") && message) {
    return { lines: {}, summary: message };
  }

  const refusal: CreateOrderRefusal = { lines: {}, summary: null };

  const byName = (name: string) =>
    lines.find((line) => line.productName === name)?.productId;

  const stock = /Insufficient stock for "(.+?)" — (\d+) available/.exec(
    message,
  );
  const gone = /Product "(.+?)" is no longer available/.exec(message);
  if (stock) {
    const id = byName(stock[1]);
    if (id) refusal.lines[id] = t.lineStockGone(Number(stock[2]));
  } else if (gone) {
    const id = byName(gone[1]);
    if (id) refusal.lines[id] = t.lineUnavailable;
  }

  const onLines = Object.keys(refusal.lines).length > 0;
  if (placed.unmapped.length > 0 || (!onLines && placed.mapped.length === 0)) {
    refusal.summary = t.failedBadRequest;
  } else if (onLines) {
    refusal.summary = t.serverErrorLine;
  }
  return refusal;
}
