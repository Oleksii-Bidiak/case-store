/**
 * How an order is NAMED to a person (TASK-1038, wave 198): «#7C1E9A42» — the
 * first eight characters of its id, upper-cased, no «…». Upper case because the
 * operator reads it aloud on the phone, where «c» and «C» are the same letter
 * and «7c1e» looks like a typo. The full id stays one hover away (`OrderNumber`).
 *
 * Every screen that names an order uses this, so the dashboard, the registry,
 * the card and the toasts can never disagree about what an order is called.
 */
export function formatOrderNumber(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}
