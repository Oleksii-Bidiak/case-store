import type { PaymentCheckoutEntity } from "@/entities/payment";

/**
 * Hand the browser off to the payment provider's hosted page (TASK-330-B).
 *
 * The store never sees card data — the shopper types it on the provider's own
 * page, which is the whole reason the store is outside PCI DSS scope
 * (docs/payments-liqpay.md §1). Getting there means a real form submission: the
 * provider expects a POST with signed fields, which `fetch` cannot express as a
 * top-level navigation.
 *
 * **Everything about the request comes from the server response.** The URL, the
 * HTTP method and every field name are read straight off
 * {@link PaymentCheckoutEntity}. Not one provider field name appears in this
 * file, and that is deliberate: the LiqPay vocabulary (`data`, `signature`,
 * `version`, …) belongs to `liqpay.adapter.ts`, which owns the signature and the
 * status map with it. A second copy in the storefront is a second thing to
 * migrate the day the provider changes — or the day a second provider is added,
 * which the backend port was explicitly designed to allow (docs §12).
 */
export function submitPaymentHandoff(
  handoff: PaymentCheckoutEntity,
  doc: Document = document,
): HTMLFormElement {
  const form = doc.createElement("form");
  form.method = handoff.method;
  form.action = handoff.url;
  // Hidden rather than merely off-screen: this form exists for one synchronous
  // submit and must never be focusable or announced in the split second it lives.
  form.hidden = true;

  for (const [name, value] of Object.entries(handoff.fields ?? {})) {
    const input = doc.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }

  doc.body.append(form);
  form.submit();
  return form;
}
