/**
 * Ukrainian noun agreement with a number (wave 198).
 *
 * The registry speaks in counted nouns — «Вибрано 3 замовлення», «Знайдено 27
 * замовлень», «Разом на сторінці: 14 товарів» — where the colon trick the rest
 * of the dictionary uses («Вибрано: 3») would lose the phrasing the owner signed
 * off on in the artboards.
 *
 * WHICH form applies is Intl's decision, not ours: `shared/lib/format/
 * formatDate.ts` documents how a hand-rolled `% 10` table put «5 хвилини» in
 * production. `Intl.PluralRules("uk-UA")` reports one / few / many / other;
 * the caller only supplies the three words.
 *
 * Pure, no "use client" — safe in the `@/shared/lib` barrel and in
 * `shared/config/dictionary.ts`.
 */

/** [one, few, many] — «товар», «товари», «товарів». */
export type PluralForms = readonly [one: string, few: string, many: string];

const rules = new Intl.PluralRules("uk-UA");

/** The form of `forms` that agrees with `count`. */
export function pluralUk(count: number, forms: PluralForms): string {
  switch (rules.select(count)) {
    case "one":
      return forms[0];
    case "many":
      return forms[2];
    // `few`, and `other` — the fractional case («1,5 товару»), which reads
    // like the few-form, never like the genitive plural.
    default:
      return forms[1];
  }
}

/** «27 замовлень» — the number formatted for uk-UA, then the agreeing noun. */
export function countLabel(count: number, forms: PluralForms): string {
  return `${count.toLocaleString("uk-UA")} ${pluralUk(count, forms)}`;
}
