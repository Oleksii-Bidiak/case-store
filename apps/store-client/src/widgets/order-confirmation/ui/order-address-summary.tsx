import type {
  OrderEntityShippingAddress,
  OrderEntityBillingAddress,
} from "@/entities/order";

interface OrderAddressSummaryProps {
  shippingAddress: OrderEntityShippingAddress; // { [key: string]: unknown } | null
  billingAddress: OrderEntityBillingAddress; // { [key: string]: unknown } | null
}

/**
 * Local view of an address snapshot. The generated nullable address types are
 * `{ [key: string]: unknown } | null` (Orval serialises the JSON blob loosely),
 * so we cast to this known shape to read fields. Mirrors `AddressDto`.
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

function AddressBlock({
  title,
  address,
}: {
  title: string;
  address: AddressSnapshot;
}) {
  const name = [address.firstName, address.lastName].filter(Boolean).join(" ");
  const cityLine = [address.city, address.state, address.postalCode]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col gap-1 text-sm">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <address className="not-italic text-muted-foreground">
        {name && <div className="text-foreground">{name}</div>}
        {address.company && <div>{address.company}</div>}
        {address.address1 && <div>{address.address1}</div>}
        {address.address2 && <div>{address.address2}</div>}
        {cityLine && <div>{cityLine}</div>}
        {address.country && <div>{address.country}</div>}
        {address.phone && <div>{address.phone}</div>}
      </address>
    </div>
  );
}

/**
 * OrderAddressSummary — renders the shipping address snapshot and, only when the
 * order has a distinct billing address, a billing block. A null `billingAddress`
 * means "same as shipping" (backend stores null in that case), so no redundant
 * block is shown. Pure presentational; data arrives via props.
 */
export function OrderAddressSummary({
  shippingAddress,
  billingAddress,
}: OrderAddressSummaryProps) {
  const shipping = shippingAddress as AddressSnapshot | null;
  const billing = billingAddress as AddressSnapshot | null;

  if (!shipping) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <AddressBlock title="Shipping Address" address={shipping} />
      {billing && <AddressBlock title="Billing Address" address={billing} />}
    </div>
  );
}
