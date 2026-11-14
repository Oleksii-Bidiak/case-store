import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { dict } from "@/shared/config";
import { apiErrorFieldErrors } from "./api-error-message";

/**
 * Put a server 400 under the field it is about (TASK-1984, forms convention
 * Rule 6b).
 *
 * The API's global ValidationPipe answers a failed DTO with, next to the joined
 * `message`, a machine-readable list built from class-validator's error tree:
 *
 *   `fieldErrors: [{ field: "shippingAddress.phone", constraint: "isUaPhone" }]`
 *
 * (`ValidationFailedException` in `apps/store-api/src/common/filters/`). These
 * helpers translate DTO paths to form fields and constraint keys to localized
 * text — never match the English `message` with a regex to find the field.
 *
 * Twin of `apps/store-client/src/shared/lib/form-errors.ts`; the apps share no
 * package (see `phone.ts` for the precedent).
 */

/** One failed constraint, as the API reports it. */
export interface ServerFieldError {
  /** Dot path into the request body: `email`, `shippingAddress.phone`, `items.0.quantity`. */
  field: string;
  /** The class-validator constraint key: `isEmail`, `maxLength`, `whitelistValidation`… */
  constraint: string;
}

/**
 * DTO path → form field. A key is an exact path (`"shippingAddress.phone"`) or a
 * prefix ending in `.*`:
 *   - `{ "items.*": "items" }` — every error under `items.` lands on `items`;
 *   - `{ "shippingAddress.*": "address.*" }` — the rest of the path is kept
 *     (`shippingAddress.phone` → `address.phone`).
 * An exact key wins over a prefix, and a longer prefix over a shorter one.
 */
export type ServerFieldMap = Record<string, string>;

/** Form field → message, overriding the default text chosen by constraint. */
export type ServerFieldMessages = Partial<Record<string, string>>;

export interface AppliedServerFieldErrors {
  /** Form fields that received an error, in the order the server listed them. */
  mapped: string[];
  /** Errors no `fieldMap` entry covers — only these may still become a toast. */
  unmapped: ServerFieldError[];
}

/** Every `fieldErrors` entry of a failed API request; `[]` when there are none. */
export function readFieldErrors(error: unknown): ServerFieldError[] {
  const list = apiErrorFieldErrors(error);
  if (!Array.isArray(list)) return [];
  return list.filter(
    (entry): entry is ServerFieldError =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as ServerFieldError).field === "string" &&
      typeof (entry as ServerFieldError).constraint === "string",
  );
}

/** The localized default for a constraint key. */
function defaultMessage(constraint: string): string {
  switch (constraint) {
    case "isUaPhone":
    case "isInternationalPhone":
      return dict.forms.phoneInvalid;
    case "isEmail":
      return dict.forms.emailInvalid;
    case "maxLength":
      return dict.forms.tooLong;
    case "isNotEmpty":
    case "minLength":
      return dict.forms.required;
    default:
      return dict.forms.invalid;
  }
}

/** The form field a DTO path maps to, or `undefined`. */
function resolveField(
  path: string,
  fieldMap: ServerFieldMap,
): string | undefined {
  const exact = fieldMap[path];
  if (exact !== undefined) return exact;

  let best: { prefix: string; target: string } | undefined;
  for (const [key, target] of Object.entries(fieldMap)) {
    if (!key.endsWith(".*")) continue;
    const prefix = key.slice(0, -1); // keep the dot: "items."
    if (!path.startsWith(prefix)) continue;
    if (!best || prefix.length > best.prefix.length) best = { prefix, target };
  }
  if (!best) return undefined;

  return best.target.endsWith(".*")
    ? best.target.slice(0, -1) + path.slice(best.prefix.length)
    : best.target;
}

function partition(
  error: unknown,
  fieldMap: ServerFieldMap,
  messages: ServerFieldMessages,
) {
  const errors: Record<string, string> = {};
  const unmapped: ServerFieldError[] = [];
  for (const entry of readFieldErrors(error)) {
    const field = resolveField(entry.field, fieldMap);
    if (field === undefined) {
      unmapped.push(entry);
      continue;
    }
    // The first error on a field is the one shown.
    if (!(field in errors)) {
      errors[field] = messages[field] ?? defaultMessage(entry.constraint);
    }
  }
  return { errors, unmapped };
}

/**
 * Form field → localized message, for any form (RHF or `useState`). Only
 * mapped errors are returned; see {@link applyServerFieldErrors} for the rest.
 */
export function mapServerFieldErrors(
  error: unknown,
  fieldMap: ServerFieldMap,
  messages: ServerFieldMessages = {},
): Record<string, string> {
  return partition(error, fieldMap, messages).errors;
}

/**
 * Sets an RHF error (`type: "server"`) on each mapped field and returns what it
 * could not map. It focuses nothing — the caller decides — and shows nothing
 * else: when `mapped` is empty the caller still owes the user a message (a toast
 * or banner, Rule 6c), and `unmapped` says whether part of the 400 is unplaced.
 */
export function applyServerFieldErrors<TFieldValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TFieldValues>,
  fieldMap: ServerFieldMap,
  messages: ServerFieldMessages = {},
): AppliedServerFieldErrors {
  const { errors, unmapped } = partition(error, fieldMap, messages);
  const mapped = Object.keys(errors);
  for (const field of mapped) {
    setError(field as Path<TFieldValues>, {
      type: "server",
      message: errors[field],
    });
  }
  return { mapped, unmapped };
}
