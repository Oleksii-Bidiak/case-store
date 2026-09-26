/**
 * The `rel` a `target="_blank"` link gets on the storefront: whatever the API
 * already put there, plus `noopener noreferrer`.
 *
 * MERGED, not overwritten (TASK-575). The API sanitizer decides `nofollow` —
 * it adds it only to links that leave the store — and a hook that replaced the
 * whole attribute threw that decision away on precisely the links that open a
 * new tab, which are mostly the external ones.
 */
export function withOpenerSafeRel(current: string | null | undefined): string {
  const tokens = (current ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  for (const required of ["noopener", "noreferrer"]) {
    if (!tokens.includes(required)) tokens.push(required);
  }
  return [...new Set(tokens)].join(" ");
}
