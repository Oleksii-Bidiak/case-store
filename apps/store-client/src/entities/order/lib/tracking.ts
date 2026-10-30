/**
 * Nova Poshta's public tracking page for a waybill (ТТН), TASK-217. The number
 * is the PATH segment — NP's page stopped filling in the old query-parameter
 * form (TASK-1987). Digits only: it is operator-typed text (TASK-335), and a stray
 * space or symbol must not break out of the path. A value with no digits at all
 * («ТТН уточнюється») is no waybill, so there is no link — `null`.
 */
export function novaPoshtaTrackingUrl(trackingNumber: string): string | null {
  const digits = trackingNumber.replace(/\D/g, "");
  return digits ? `https://novaposhta.ua/tracking/${digits}` : null;
}
