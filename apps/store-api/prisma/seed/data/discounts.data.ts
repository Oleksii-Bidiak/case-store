/** Promo codes. A factory, not a literal: two codes carry `Date.now()`-relative dates. */
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
  ];

  return discountsData;
}
