import type { OrderEntity } from "@/entities/order";
import { dict } from "@/shared/config";

interface OrderBillingAddressProps {
  shippingAddress: OrderEntity["shippingAddress"];
  billingAddress: OrderEntity["billingAddress"];
}

/**
 * Local view of an address snapshot. The generated nullable address types are
 * loose (Orval serialises the JSON blob as an open object), so we cast to this
 * known shape to read fields. Mirrors `AddressDto`.
 */
interface AddressSnapshot {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
}

/** The fields that make two addresses "the same place for the same person". */
const COMPARED: (keyof AddressSnapshot)[] = [
  "firstName",
  "lastName",
  "company",
  "address1",
  "address2",
  "city",
  "state",
  "postalCode",
  "country",
  "phone",
];

function sameAddress(
  a: AddressSnapshot | null,
  b: AddressSnapshot | null,
): boolean {
  if (!a || !b) return false;
  return COMPARED.every(
    (key) => String(a[key] ?? "").trim() === String(b[key] ?? "").trim(),
  );
}

/**
 * OrderBillingAddress — «Адреса оплати», shown only when the order carries a
 * billing address of its own (TASK-1022): the API now stores `null` when the
 * buyer sent none, and a copy that repeats the delivery address says nothing
 * new. The delivery itself is `OrderDeliveryBlock` (TASK-647). Pure
 * presentational; data arrives via props.
 */
export function OrderBillingAddress({
  shippingAddress,
  billingAddress,
}: OrderBillingAddressProps) {
  const billing = billingAddress as AddressSnapshot | null;
  const shipping = shippingAddress as AddressSnapshot | null;

  if (!billing || sameAddress(billing, shipping)) {
    return null;
  }

  const name = [billing.firstName, billing.lastName].filter(Boolean).join(" ");
  const cityLine = [billing.city, billing.state, billing.postalCode]
    .filter(Boolean)
    .join(", ");

  return (
    <section
      data-testid="order-billing-address"
      className="flex flex-col gap-1 text-sm"
    >
      <h2 className="text-xl font-semibold text-foreground">
        {dict.order.billingAddress}
      </h2>
      <address className="text-muted-foreground not-italic">
        {name && <div className="text-foreground">{name}</div>}
        {billing.company && <div>{billing.company}</div>}
        {billing.address1 && <div>{billing.address1}</div>}
        {billing.address2 && <div>{billing.address2}</div>}
        {cityLine && <div>{cityLine}</div>}
        {billing.country && (
          <div>{dict.order.countryLabel(billing.country)}</div>
        )}
        {billing.phone && <div>{billing.phone}</div>}
      </address>
    </section>
  );
}
