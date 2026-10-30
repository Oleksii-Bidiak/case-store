import { faqs } from './faq.data';
import { pagesData } from './pages.data';

/**
 * No seeded FAQ answer or page promises free Nova Poshta delivery (TASK-1661).
 *
 * Nova Poshta is never free (B-6 №2): the shopper pays the carrier's tariff,
 * priced on the checkout, and nothing implements a fixed «від 1 000 ₴» rule.
 * Only the courier has a threshold, set by the owner in the delivery settings —
 * seed copy cannot know it, so it must not name one either.
 */
const FIXED_THRESHOLD = /від\s*1[\s ]?000\s*₴/i;
const FREE_DELIVERY = /безкоштовн\S*\s+доставк/i;

const seeded: [string, string][] = [
  ...faqs.map((faq) => [`faq ${faq.id}`, faq.answer] as [string, string]),
  ...pagesData.flatMap((page) =>
    (['excerpt', 'metaDescription', 'content'] as const).map(
      (field) => [`page ${page.slug}.${field}`, page[field]] as [string, string],
    ),
  ),
];

describe('seeded content — shipping promise (TASK-1661)', () => {
  it('never names a fixed free-shipping threshold', () => {
    expect(seeded.filter(([, text]) => FIXED_THRESHOLD.test(text)).map(([where]) => where)).toEqual(
      [],
    );
  });

  it('never promises free delivery', () => {
    expect(seeded.filter(([, text]) => FREE_DELIVERY.test(text)).map(([where]) => where)).toEqual(
      [],
    );
  });
});
