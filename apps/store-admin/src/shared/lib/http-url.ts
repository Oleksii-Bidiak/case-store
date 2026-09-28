import { z } from "zod";

/**
 * True when `value` is an absolute `http:` / `https:` URL.
 *
 * Why not zod's `.url()`: it is `new URL()` in a try/catch, and `new URL()`
 * accepts ANY scheme — `javascript:alert(1)` and `data:image/png;base64,…`
 * pass, reach the API and come back as a generic 400 instead of a hint under
 * the field (TASK-573). Everything the admin stores as a link a browser will
 * load (OG images, sameAs profiles) must be plain http(s).
 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * An optional http(s) URL text field: trimmed; `""` (or a missing value) is
 * valid and means "not set"; anything else must pass {@link isHttpUrl}, or
 * `message` is shown under the field.
 */
export function optionalHttpUrl(message: string) {
  return z
    .string()
    .trim()
    .refine((value) => value === "" || isHttpUrl(value), message)
    .optional();
}
