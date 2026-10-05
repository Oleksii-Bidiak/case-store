/**
 * Escape text for Telegram's `parse_mode: 'HTML'` (TASK-674).
 *
 * Telegram's HTML mode accepts only a handful of tags and rejects the WHOLE
 * message with a 400 ("can't parse entities") on a stray `<` or `&` — which the
 * outbox treats as permanent. So every value a renderer interpolates that came
 * from a person (a customer's name, a contact-form message, a product title)
 * goes through this, and only the renderer's own markup stays unescaped.
 *
 * `"` is escaped too, so a value is also safe inside an attribute
 * (`<a href="…">`).
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
