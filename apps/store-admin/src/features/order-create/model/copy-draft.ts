import type { OrderCopyDraftEntity } from "@/entities/order";
import {
  CREATE_ORDER_DEFAULTS,
  CUSTOMER_MODE,
  type CreateOrderFormValues,
  type DraftLine,
  type PickedCustomer,
} from "./create-order-schema";

/**
 * «Створити копію» (TASK-2048): the original's prefill
 * (`GET /admin/orders/:id/copy-draft`) as the create form's starting state —
 * the form values, the picked lines and the picked account. Pure mapping; the
 * form applies it with `reset()` keyed to the original's id (forms.md Rule 2b).
 */

/** A stored phone is digits only (`normalizePhone`); the form's rule wants «+». */
const asTyped = (phone: string | null | undefined): string => {
  const value = (phone ?? "").trim();
  return /^\d+$/.test(value) ? `+${value}` : value;
};

const digits = (phone: string): string => phone.replace(/\D/g, "");

/** A walk-in's one-string name, split the way it was most likely typed. */
function splitContactName(
  name: string,
  address: OrderCopyDraftEntity["shippingAddress"],
): [string, string] {
  const joined = [address?.firstName, address?.lastName]
    .filter(Boolean)
    .join(" ");
  if (address && joined === name.trim()) {
    return [address.firstName, address.lastName];
  }
  const [first = "", ...rest] = name.trim().split(/\s+/);
  return [first, rest.join(" ")];
}

export function copyDraftToFormValues(
  draft: OrderCopyDraftEntity,
): CreateOrderFormValues {
  const address = draft.shippingAddress;
  const account = draft.userId ? draft.customer : null;
  const [contactFirstName, contactLastName] = account
    ? [account.firstName ?? "", account.lastName ?? ""]
    : splitContactName(draft.contact?.name ?? "", address);
  const contactPhone = asTyped(
    account ? (account.phone ?? address?.phone) : draft.contact?.phone,
  );
  const recipientPhone = asTyped(address?.phone ?? "");

  // The client block IS the recipient when the parcel carried the same name
  // and number — the form's default, and what most phone orders are.
  const sameRecipient =
    !address ||
    (address.firstName === contactFirstName &&
      address.lastName === contactLastName &&
      (recipientPhone === "" ||
        digits(recipientPhone) === digits(contactPhone)));
  const pickup = draft.deliveryMethod === "PICKUP";

  return {
    ...CREATE_ORDER_DEFAULTS,
    customerMode: account ? CUSTOMER_MODE.ACCOUNT : CUSTOMER_MODE.GUEST,
    userId: draft.userId ?? "",
    contactFirstName,
    contactLastName,
    contactEmail: account ? account.email : (draft.contact?.email ?? ""),
    contactPhone,
    sameRecipient,
    firstName: sameRecipient ? "" : (address?.firstName ?? ""),
    lastName: sameRecipient ? "" : (address?.lastName ?? ""),
    phone: sameRecipient ? "" : recipientPhone,
    // A pickup order is collected at the point: its address is the point's.
    city: pickup ? "" : (address?.city ?? ""),
    address1: pickup ? "" : (address?.address1 ?? ""),
    postalCode: address?.postalCode ?? "",
    npCityRef:
      draft.deliveryMethod === "NOVA_POSHTA" ? (address?.npCityRef ?? "") : "",
    npWarehouseRef:
      draft.deliveryMethod === "NOVA_POSHTA"
        ? (address?.npWarehouseRef ?? "")
        : "",
    deliveryMethod: draft.deliveryMethod,
    pickupPointId: draft.pickupPointId ?? "",
    shippingCost: draft.shippingCost ?? "",
    paymentMethod: draft.paymentMethod,
    notes: draft.notes ?? "",
  };
}

/** The copied lines, at today's catalogue price (display only — never sent). */
export function copyDraftLines(draft: OrderCopyDraftEntity): DraftLine[] {
  return draft.items.map((line) => ({
    productId: line.productId,
    productName: line.productName,
    sku: line.sku,
    price: line.price,
    quantity: line.quantity,
    stock: line.stock,
  }));
}

/** The account an account order belongs to; null for a walk-in. */
export function copyDraftCustomer(
  draft: OrderCopyDraftEntity,
): PickedCustomer | null {
  const customer = draft.userId ? draft.customer : null;
  if (!customer) return null;
  const firstName = customer.firstName ?? "";
  const lastName = customer.lastName ?? "";
  return {
    id: customer.id,
    name: [firstName, lastName].filter(Boolean).join(" ") || customer.email,
    firstName,
    lastName,
    email: customer.email,
    phone: customer.phone ?? "",
    // A deactivated account is refused by the server with its own message.
    isActive: true,
  };
}
