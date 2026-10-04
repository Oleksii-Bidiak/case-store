import { formatUAPhone, isValidUAPhone } from "@/shared/lib/phone";

/** The few profile fields every customer surface names a person by. */
export interface CustomerNameFields {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * «Оксана Шевченко», or the address when the shopper never gave a name
 * (UsersProposal К1/К4). One rule for the list, the card and its dialogs, so the
 * row, the heading and «Деактивувати акаунт клієнта?» name the same person.
 */
export function customerDisplayName(user: CustomerNameFields): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
}

/** The avatar letter — from the name when there is one, not from the email. */
export function customerInitial(user: CustomerNameFields): string {
  return customerDisplayName(user).charAt(0).toUpperCase();
}

/**
 * A stored phone as an operator reads it: `+380 50 123 4567` for a Ukrainian
 * number, the stored value otherwise (a foreign number is legitimate — see
 * `shared/lib/phone.ts`), `null` when there is none. The same rule the order
 * list and card already apply.
 */
export function customerPhone(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  return isValidUAPhone(value) ? formatUAPhone(value) : value;
}
