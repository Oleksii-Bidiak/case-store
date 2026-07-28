/**
 * The one place that absorbs an OpenAPI-generation artifact on nullable string
 * fields.
 *
 * ── What goes wrong upstream ────────────────────────────────────────────────
 * Several backend DTOs declare a clearable text field as
 * `@ApiProperty({ required: false, nullable: true, maxLength: 64 })` WITHOUT an
 * explicit `type: String`. Swagger emits that as a property with a `nullable`
 * flag and no `type`, and Orval — correctly, given a schema that names no type —
 * widens it to `{ [key: string]: unknown } | null`. So `trackingNumber`,
 * `internalNotes`, `operatorNotes` and `refundedAmount` arrive in the generated
 * client typed as objects, and assigning the string they actually are is a type
 * error.
 *
 * ── Why a cast, and why here ────────────────────────────────────────────────
 * The generated files must not be hand-edited, and the DTOs live in `store-api`,
 * which this wave does not own. That leaves a cast — so it is written ONCE, with
 * this note attached, rather than sprinkled inline at four call sites where the
 * next reader would have to guess whether it was a shortcut or a necessity.
 *
 * The runtime contract is unchanged and is the one the server documents: a
 * non-empty string sets the field, `null` clears it. Blank input becomes `null`
 * rather than `""`, because "cleared" and "the empty string" are different
 * claims and the backend's own `@Transform` makes the same distinction.
 *
 * **Delete this the moment those DTOs gain `type: String`** — the generated
 * types will collapse to `string | null` and every call site will typecheck
 * without help.
 */
export function nullableTextField<T>(value: string | null | undefined): T {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return (trimmed === "" ? null : trimmed) as T;
}
