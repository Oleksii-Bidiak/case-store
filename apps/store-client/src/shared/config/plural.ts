/**
 * Ukrainian cardinal plural forms (TASK-217): «1 замовлення», «2 замовлення»,
 * «5 замовлень», «11 замовлень», «21 замовлення».
 *
 * - `one`  — ends in 1, but not in 11 (1, 21, 101);
 * - `few`  — ends in 2–4, but not in 12–14 (2, 23, 104);
 * - `many` — everything else (0, 5–20, 25, 111…).
 *
 * The same rule is spelled inline in several older dictionary entries
 * (`catalog.loadMore`, `legal.tocToggle`…); new entries call this instead.
 * Lives in `shared/config`, next to the dictionary that uses it, because
 * `shared/lib` already imports the dictionary — a helper there would be a cycle.
 */
export function pluralUk(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const n = Math.abs(Math.trunc(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
