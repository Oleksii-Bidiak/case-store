/**
 * Nova Poshta's public tracking page for a waybill (ТТН), TASK-217. The number
 * is URL-encoded although a real ТТН is 14 digits: it is operator-typed text
 * (TASK-335), and a stray space or symbol must not break out of the parameter.
 */
export function novaPoshtaTrackingUrl(trackingNumber: string): string {
  return `https://novaposhta.ua/tracking/?cargo_number=${encodeURIComponent(
    trackingNumber.trim(),
  )}`;
}
