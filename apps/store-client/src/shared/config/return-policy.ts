/**
 * The store's return policy as structured data states it (TASK-556).
 *
 * 14 days is not a business choice here but the statutory floor: Закон України
 * «Про захист прав споживачів», ст. 9, gives a buyer 14 days (not counting the
 * day of purchase) to return a product of proper quality, and the storefront's
 * own copy (`/info` «14 днів на повернення», the seeded «Повернення та обмін»
 * page) already promises exactly that. A longer window the owner offers would
 * go here too — this is the one constant `Offer.hasMerchantReturnPolicy` reads.
 *
 * Imported by its module path, not through the `shared/config` barrel, so the
 * barrel's shape stays untouched.
 */
export const RETURN_POLICY = {
  /** ISO 3166-1 alpha-2 — the country the policy applies to. */
  country: "UA",
  /** Days after delivery the buyer may return a product of proper quality. */
  days: 14,
} as const;
