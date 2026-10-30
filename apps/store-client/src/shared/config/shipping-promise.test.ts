import { dict } from "./dictionary";

/**
 * No storefront copy promises free Nova Poshta delivery (TASK-1661).
 *
 * Nova Poshta is never free (B-6 №2): the shopper pays the carrier's tariff,
 * priced on the checkout. Only the courier has a threshold (`courierFreeFrom`),
 * and its copy interpolates the live amount — those strings are functions or sit
 * under a `courier*` key, so they are skipped. Every other static string is
 * walked, so the next fallback that brings back «безкоштовно від 1 000 ₴» fails
 * here instead of in front of a shopper.
 */
const FIXED_THRESHOLD = /від\s*1[\s ]?000\s*₴/i;
const FREE_DELIVERY = /безкоштовн\S*\s+доставк/i;

function staticStrings(
  node: unknown,
  path: string[] = [],
): Array<[string, string]> {
  if (typeof node === "string") return [[path.join("."), node]];
  if (node === null || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([key, value]) =>
    /courier/i.test(key) ? [] : staticStrings(value, [...path, key]),
  );
}

describe("storefront dictionary — shipping promise (TASK-1661)", () => {
  const strings = staticStrings(dict);

  it("walks the whole dictionary", () => {
    expect(strings.length).toBeGreaterThan(500);
  });

  it("never names a fixed free-shipping threshold", () => {
    expect(
      strings.filter(([, text]) => FIXED_THRESHOLD.test(text)).map(([p]) => p),
    ).toEqual([]);
  });

  it("never promises free delivery outside the courier copy", () => {
    expect(
      strings.filter(([, text]) => FREE_DELIVERY.test(text)).map(([p]) => p),
    ).toEqual([]);
  });

  it("keeps the courier threshold copy, which names the live amount", () => {
    expect(dict.checkout.delivery.courierFree("1 500 ₴")).toMatch(
      /кур'єром безкоштовна/,
    );
  });
});
