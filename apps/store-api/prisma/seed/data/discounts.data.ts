/** Promo codes. A factory, not a literal: several codes carry `Date.now()`-relative dates. */
export function buildDiscountsData() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const discountsData: {
    code: string;
    type: 'PERCENT' | 'FIXED';
    value: number;
    minSpend?: number;
    maxRedemptions?: number;
    perUserLimit?: number;
    startsAt?: Date;
    expiresAt?: Date;
    isActive: boolean;
    /** TASK-731: listed on the storefront «Акції» page (a private code still applies by code). */
    showOnPromoPage: boolean;
  }[] = [
    {
      code: 'WELCOME10',
      type: 'PERCENT',
      value: 10,
      perUserLimit: 1,
      isActive: true,
      showOnPromoPage: true,
    },
    {
      code: 'SUMMER500',
      type: 'FIXED',
      value: 500,
      minSpend: 3000,
      isActive: true,
      showOnPromoPage: true,
    },
    {
      code: 'VIP20',
      type: 'PERCENT',
      value: 20,
      maxRedemptions: 100,
      perUserLimit: 1,
      isActive: true,
      // The demo PRIVATE code: works at checkout, absent from the «Акції» page.
      showOnPromoPage: false,
    },
    {
      code: 'EXPIRED15',
      type: 'PERCENT',
      value: 15,
      startsAt: new Date(now - 60 * day),
      expiresAt: new Date(now - 5 * day),
      isActive: true,
      showOnPromoPage: true,
    },
    { code: 'OLDPROMO', type: 'FIXED', value: 200, isActive: false, showOnPromoPage: false },
    // TASK-2569: a code that has not started yet — the admin list shows it as
    // scheduled, the «Акції» page lists it only from `startsAt` on, and
    // checkout refuses it until then.
    {
      code: 'NEWYEAR15',
      type: 'PERCENT',
      value: 15,
      startsAt: new Date(now + 5 * day),
      expiresAt: new Date(now + 40 * day),
      isActive: true,
      showOnPromoPage: true,
    },
    // TASK-2569: used up — two real redemptions on seeded orders reach
    // `maxRedemptions`, so checkout refuses it and the «Акції» page hides it.
    {
      code: 'FLASH300',
      type: 'FIXED',
      value: 300,
      minSpend: 1000,
      maxRedemptions: 2,
      startsAt: new Date(now - 10 * day),
      expiresAt: new Date(now + 20 * day),
      isActive: true,
      showOnPromoPage: true,
    },
    // TASK-2569: a third live code on the «Акції» page, with an end date.
    {
      code: 'AUDIO7',
      type: 'PERCENT',
      value: 7,
      startsAt: new Date(now - 3 * day),
      expiresAt: new Date(now + 14 * day),
      isActive: true,
      showOnPromoPage: true,
    },
  ];

  return discountsData;
}
