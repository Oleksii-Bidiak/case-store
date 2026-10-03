import { countLabel, pluralUk, type PluralForms } from "./plural";

/**
 * Wave 198: the registry needs «Вибрано 3 замовлення», «Знайдено 27
 * замовлень», «Разом на сторінці: 14 замовлень». The CATEGORY (one / few /
 * many) is Intl's decision — hand-rolled `% 10` tables are exactly how «5
 * хвилини» reached production before (see shared/lib/format/formatDate.ts). The
 * caller only supplies the three word forms.
 */
const ORDERS: PluralForms = ["замовлення", "замовлення", "замовлень"];
const GOODS: PluralForms = ["товар", "товари", "товарів"];

describe("pluralUk", () => {
  it.each([
    [1, "товар"],
    [21, "товар"],
    [101, "товар"],
    [2, "товари"],
    [3, "товари"],
    [4, "товари"],
    [22, "товари"],
    [0, "товарів"],
    [5, "товарів"],
    [11, "товарів"],
    [12, "товарів"],
    [14, "товарів"],
    [111, "товарів"],
    [312, "товарів"],
  ])("%i → %s", (count, form) => {
    expect(pluralUk(count, GOODS)).toBe(form);
  });

  it("uses the genitive-singular (few) form for a fraction", () => {
    // «1,5 товару» territory: Intl reports `other`, which in Ukrainian reads
    // like the few-form, never like «товарів».
    expect(pluralUk(1.5, GOODS)).toBe("товари");
  });
});

describe("countLabel", () => {
  it("puts a uk-UA-formatted number in front of the right form", () => {
    expect(countLabel(27, ORDERS)).toBe("27 замовлень");
    expect(countLabel(3, ORDERS)).toBe("3 замовлення");
    // A thousands separator, not «1234».
    expect(countLabel(1234, GOODS)).toMatch(/^1\s234 товари$/u);
  });
});
