import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "@/shared/lib";
import type { DraftLine } from "./create-order-schema";

const t = dict.orderCreate;

/** What a refused create says, placed where the operator can act on it. */
export interface CreateOrderRefusal {
  /** productId → the sentence under that line (Н3). */
  lines: Record<string, string>;
  /** Form fields the server named, with OUR wording of the rule. */
  fields: Partial<Record<"notes" | "internalNotes", string>>;
  /** The box in «Підсумок»: what happened, in one line. */
  summary: string;
}

/**
 * Read a 400 from `POST /admin/orders` (TASK-957 / 958, wave 198 Н3).
 *
 * The server answers in English, written for a log — never shown. What it
 * says is read only to PLACE the refusal: a product it names (by the name the
 * operator picked, in quotes) gets its sentence under that line, a field
 * class-validator names gets ours under the field. Everything else keeps the
 * generic «перевірте клієнта, товари та наявність».
 *
 * Matching on the message is the only handle the API gives today; stable
 * error codes for these refusals are an API tail of TASK-1047.
 */
export function readCreateOrderRefusal(
  error: unknown,
  lines: readonly DraftLine[],
): CreateOrderRefusal | null {
  if (apiErrorStatus(error) !== 400) return null;
  const message = apiErrorMessage(error) ?? "";

  // TASK-1021: the delivery refusals are the exception to "never shown" — the
  // API words them in Ukrainian for the person on the phone («…оберіть оплату
  // при отриманні або вкажіть місто Нової Пошти»), under a stable `DELIVERY_*`
  // code, so the sentence is shown as it came.
  if (apiErrorCode(error)?.startsWith("DELIVERY_") && message) {
    return { lines: {}, fields: {}, summary: message };
  }

  const refusal: CreateOrderRefusal = {
    lines: {},
    fields: {},
    summary: t.failedBadRequest,
  };

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

  // class-validator: «internalNotes must be shorter than or equal to …».
  if (/\binternalNotes\b/.test(message)) {
    refusal.fields.internalNotes = t.internalNotesTooLong;
  }
  if (/\bnotes\b/.test(message)) {
    refusal.fields.notes = t.notesTooLong;
  }

  if (Object.keys(refusal.lines).length > 0) {
    refusal.summary = t.serverErrorLine;
  } else if (Object.keys(refusal.fields).length > 0) {
    refusal.summary = t.serverErrorFields;
  }
  return refusal;
}
