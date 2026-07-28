import { dict } from "@/shared/config";

/**
 * The payment methods the storefront can offer, and the rules that decide which
 * of them are *real* for a given shopper (TASK-330-B).
 *
 * ── Why this file exists at all ────────────────────────────────────────────────
 * The section this feeds used to be a static "there is exactly one method" block,
 * and before that a radio group whose "Картка онлайн" option was never sent
 * anywhere: the order was created PENDING regardless, so a shopper who picked it
 * was shown a successful order while no payment existed. The lesson is encoded
 * here rather than in prose — an option is only ever offered when the storefront
 * can genuinely carry it through to the provider, and {@link resolvePaymentMethods}
 * is the single place that decides that.
 *
 * ── How a method actually reaches the backend ─────────────────────────────────
 * `CreateOrderDto` carries NO payment-method field (see the generated model), so
 * the choice is not a property of the create-order call. It reaches the API as an
 * *action*:
 *
 *   ON_DELIVERY  → create the order and stop. This is the backend's own default
 *                  (`Order.paymentMethod @default(ON_DELIVERY)`), so what the
 *                  shopper picked and what is stored agree.
 *   ONLINE /     → create the order, then `POST /api/payments/orders/:id/checkout`,
 *   INSTALLMENTS   which opens a real `Payment` attempt and returns a signed
 *                  handoff. The browser then leaves for the provider's page.
 *
 * See `docs/payments-liqpay.md` §3 — the order is created first and the handoff
 * second, exactly as modelled above.
 *
 * ── Availability ──────────────────────────────────────────────────────────────
 * There is no endpoint that reports which methods the merchant has configured, so
 * availability is read from `NEXT_PUBLIC_PAYMENT_METHODS` — a comma-separated
 * allowlist in OUR vocabulary, not the provider's. Deliberately not the provider's
 * `paytypes` string: LiqPay's field vocabulary belongs to the backend adapter, and
 * duplicating it in the storefront is how the two drift apart. In practice
 * INSTALLMENTS is switched on here when, and only when, the server's
 * `LIQPAY_PAYTYPES` carries `payparts` / `moment_part` and the bank has approved
 * the "Оплата частинами" agreement (docs/payments-liqpay.md §11).
 *
 * Unset ⇒ cash on delivery only. That default is the safe one: a store with no
 * merchant keys shows no card option instead of an option that 503s.
 *
 * The right long-term fix is a `GET /api/payments/methods` endpoint so the server
 * stays the single source of truth; until it exists this flag is the seam.
 */

/** Every method the storefront knows how to carry out. Mirrors `PaymentMethod`. */
export const CHECKOUT_PAYMENT_METHODS = [
  "ON_DELIVERY",
  "ONLINE",
  "INSTALLMENTS",
] as const;

export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number];

/** Cash on delivery is always available and is what an untouched form submits. */
export const DEFAULT_PAYMENT_METHOD: CheckoutPaymentMethod = "ON_DELIVERY";

/** Methods that hand the browser off to the provider's hosted page. */
const HANDOFF_METHODS: ReadonlySet<CheckoutPaymentMethod> = new Set([
  "ONLINE",
  "INSTALLMENTS",
]);

/** Does choosing this method require a provider handoff after order creation? */
export function requiresPaymentHandoff(method: CheckoutPaymentMethod): boolean {
  return HANDOFF_METHODS.has(method);
}

/**
 * Why an offered method cannot be used right now.
 *
 * `account-required` is not a product decision — `POST /api/payments/orders/:id/checkout`
 * is behind `JwtAuthGuard` and resolves the order through `OrderService.getOrder(userId, …)`,
 * so a guest literally cannot open a payment attempt. Rather than let a guest pick
 * card and dead-end on a 401, the option is shown disabled with the reason. Guest
 * checkout itself is unaffected: cash on delivery needs no account (TASK-338).
 */
export type PaymentMethodBlocker = "account-required";

export interface PaymentMethodOption {
  method: CheckoutPaymentMethod;
  title: string;
  note: string;
  /** False when the shopper cannot complete this method as they are right now. */
  enabled: boolean;
  blockedBy?: PaymentMethodBlocker;
}

const COPY: Record<CheckoutPaymentMethod, { title: string; note: string }> = {
  ON_DELIVERY: {
    title: dict.checkout.payment.onDeliveryTitle,
    note: dict.checkout.payment.onDeliveryNote,
  },
  ONLINE: {
    title: dict.checkout.payment.onlineTitle,
    note: dict.checkout.payment.onlineNote,
  },
  INSTALLMENTS: {
    title: dict.checkout.payment.installmentsTitle,
    note: dict.checkout.payment.installmentsNote,
  },
};

/**
 * Parse the configured method allowlist.
 *
 * Unknown values are dropped rather than trusted — a typo in the deployment
 * environment must not put an option on the page that nothing can honour.
 * ON_DELIVERY is always present: it needs no provider, no keys and no account.
 */
export function parseConfiguredMethods(
  raw: string | undefined | null,
): CheckoutPaymentMethod[] {
  const known = new Set<string>(CHECKOUT_PAYMENT_METHODS);
  const configured = (raw ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => known.has(value)) as CheckoutPaymentMethod[];

  return CHECKOUT_PAYMENT_METHODS.filter(
    (method) =>
      method === DEFAULT_PAYMENT_METHOD || configured.includes(method),
  );
}

/**
 * Read the deployment's allowlist.
 *
 * Read inside a function, not at module scope: Next.js inlines the whole
 * `process.env.NEXT_PUBLIC_*` expression at build time either way, and keeping it
 * behind a call lets tests vary it.
 */
export function readConfiguredMethods(): CheckoutPaymentMethod[] {
  return parseConfiguredMethods(process.env.NEXT_PUBLIC_PAYMENT_METHODS);
}

export interface ResolvePaymentMethodsInput {
  /** Methods this deployment has switched on. */
  configured: CheckoutPaymentMethod[];
  /** Whether the shopper is signed in (guests cannot open a payment attempt). */
  isAuthenticated: boolean;
}

/**
 * Turn configuration + shopper state into the exact list the UI renders.
 *
 * Every returned option is either usable, or visibly disabled with the reason —
 * never silently inert.
 */
export function resolvePaymentMethods({
  configured,
  isAuthenticated,
}: ResolvePaymentMethodsInput): PaymentMethodOption[] {
  return configured.map((method) => {
    const needsAccount = requiresPaymentHandoff(method) && !isAuthenticated;
    return {
      method,
      ...COPY[method],
      enabled: !needsAccount,
      ...(needsAccount ? { blockedBy: "account-required" as const } : {}),
    };
  });
}

/**
 * The method to submit, given what the shopper selected and what is actually
 * available. Guards the case where a selection is made and then invalidated —
 * e.g. the options list narrows — so an unusable method can never be submitted.
 */
export function coercePaymentMethod(
  selected: CheckoutPaymentMethod | undefined,
  options: PaymentMethodOption[],
): CheckoutPaymentMethod {
  const match = options.find(
    (option) => option.method === selected && option.enabled,
  );
  return match?.method ?? DEFAULT_PAYMENT_METHOD;
}
