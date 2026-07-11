/**
 * Escape the 5 XML-special characters for safe interpolation into element
 * content or attribute values. `&` is replaced first so the entities produced
 * by the later replacements are not double-escaped.
 *
 * Chosen over CDATA (plan 148, Decision 3): feed text is already stripped to
 * plain prose before it gets here, and entity escaping avoids the CDATA edge
 * case where source text containing a literal `]]>` would break the document.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
