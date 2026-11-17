import { z } from "zod";
import type { CreateManualOrderDto } from "@/entities/order";
import {
  ADDRESS_LIMITS,
  type CourierTermsDto,
  type DeliveryMethod,
} from "@/entities/delivery";
import { dict } from "@/shared/config";
// Both phones are `@IsInternationalPhone` on the API (`GuestContactDto.phone`,
// `AddressDto.phone`, TASK-338) — the rule named the same here (Rule 5a).
import { phoneField } from "@/shared/lib/phone-field";
import { emailField } from "@/shared/lib/form-fields";
import { parseMoneyInput } from "@/shared/lib/money-input";

const t = dict.orderCreate;

/** `CreateManualOrderDto.notes` — `@MaxLength(500)`. */
export const NOTES_MAX_LENGTH = 500;
/** `CreateManualOrderDto.internalNotes` — `@MaxLength(2000)`. */
export const INTERNAL_NOTES_MAX_LENGTH = 2000;
/** `GuestContactDto.name` (`guest-contact.dto.ts`) — `@MaxLength(120)`. */
export const CONTACT_NAME_MAX_LENGTH = 120;
/**
 * The client's phone. `GuestContactDto.phone` allows 32 characters, but this
 * number is ALSO the recipient's while «той самий клієнт» is ticked, and
 * `AddressDto.phone` allows 30 — stricter on purpose (Rule 5f), so the copy can
 * never be refused. Fifteen digits with separators fit in 30 with room to spare.
 */
export const CONTACT_PHONE_MAX_LENGTH = ADDRESS_LIMITS.phone;

/** A name `AddressDto` takes: present, at most 100 characters. */
const requiredName = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .max(ADDRESS_LIMITS.name, dict.forms.tooLong);
const optionalName = z
  .string()
  .trim()
  .max(ADDRESS_LIMITS.name, dict.forms.tooLong);

const contactPhoneRule = z
  .string()
  .trim()
  .max(CONTACT_PHONE_MAX_LENGTH, dict.forms.tooLong)
  .pipe(phoneField({ rule: "international", message: t.contactPhoneInvalid }));
// An empty recipient phone is ONE message, «обовʼязкове поле» — not that AND
// «wrong format» for the same blank input.
const recipientPhoneRule = z
  .string()
  .trim()
  .min(1, t.addressRequired)
  .max(ADDRESS_LIMITS.phone, dict.forms.tooLong)
  .pipe(phoneField({ rule: "international", message: t.contactPhoneInvalid }));

/** A line the operator has picked, carrying enough to render it back. */
export interface DraftLine {
  readonly productId: string;
  readonly productName: string;
  /** Catalogue price at pick time — DISPLAY ONLY. Never sent. */
  readonly price: string;
  readonly quantity: number;
  /** Shown under the name (Н1). DISPLAY ONLY. */
  readonly sku?: string | null;
  /** Free stock at pick time — caps «+», DISPLAY ONLY; the server re-checks. */
  readonly stock?: number;
}

/**
 * The customer the operator picked out of the search results (TASK-426).
 *
 * Display data only: the form sends `userId` and nothing else about the account.
 * It lives in the FORM's state rather than in the schema for that reason — a
 * label in the payload would be a second source of truth for a name the server
 * already holds.
 */
export interface PickedCustomer {
  readonly id: string;
  /** Both names joined for display, or the "no name" placeholder. */
  readonly name: string;
  /** Kept apart from {@link name} so the recipient block can be prefilled. */
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly isActive: boolean;
}

/**
 * Who the order belongs to.
 *
 * An explicit choice rather than "fill in whichever you have", because the two
 * are mutually exclusive on the server (`userId` XOR `contact`) and an operator
 * filling in both would be told so only after submitting.
 */
export const CUSTOMER_MODE = {
  ACCOUNT: "account",
  GUEST: "guest",
} as const;

export type CustomerMode = (typeof CUSTOMER_MODE)[keyof typeof CUSTOMER_MODE];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An order the operator places on the customer's behalf — a phone order
 * (TASK-341, revised by TASK-426).
 *
 * There is deliberately NO price field anywhere in this schema, mirroring the
 * backend DTO. An operator-created order is still a sale at the shop's price;
 * accepting a price here would make every discount a matter of whoever happens
 * to be on the phone, and would leave no record that one was given.
 *
 * ── What TASK-426 changed, and why ───────────────────────────────────────────
 *   - `userId` is still a UUID, but NO HUMAN TYPES IT any more: it arrives from
 *     the customer picker, so the rule is a guard against a broken picker rather
 *     than something an operator can fail. Hence the message names the list, not
 *     the format.
 *   - Both phone fields are judged by `isValidInternationalPhone`, which counts
 *     the DIGITS of the normalised value. The old rule was `length >= 6` on the
 *     contact phone and `min(1)` on the recipient's, so `123456` was a number for
 *     the courier to call — in the one place where no shopper is around to notice
 *     their own number is wrong.
 *
 *     ── Why this rule and NOT the Ukrainian one ─────────────────────────────
 *     Both values reach endpoints that are country-agnostic on purpose:
 *     `AddressDto.phone` and `GuestContactDto.phone` carry
 *     `@IsInternationalPhone` because "an operator entering a phone order may
 *     legitimately be given a roaming or foreign number" (TASK-338, restated by
 *     the owner 2026-09-10). The first cut of TASK-426 used `isValidUAPhone`
 *     here, which made this form refuse `+48` numbers the API accepts — a
 *     capability regression the owner had explicitly carved out, and one only a
 *     border-region customer would ever discover. A form must not be stricter
 *     than the endpoint it posts to unless someone decided it should be; here
 *     someone decided the opposite.
 *
 *     The `+380` mask went with it: `PhoneInput` rewrites every value into a
 *     Ukrainian shape and truncates at nine local digits, so it cannot coexist
 *     with a field that must accept `+48 22 123 4567`.
 *   - The contact EMAIL is now optional, matching `ManualOrderContactDto` on the
 *     API: an operator with the customer on the line often has no email, and
 *     demanding one produced an invented address or no order. The phone is the
 *     required contact, because it is what the courier dials.
 */
export const createOrderSchema = z
  .object({
    customerMode: z.enum([CUSTOMER_MODE.ACCOUNT, CUSTOMER_MODE.GUEST]),
    userId: z.string().trim(),
    // TASK-2398: the client's name is two fields, never one split by guesswork —
    // `splitName("Оксана")` left the surname empty and the order unplaceable.
    // Every client field is judged in the refinement, by mode and checkbox.
    contactFirstName: z.string().trim(),
    contactLastName: z.string().trim(),
    contactEmail: z.string().trim(),
    contactPhone: z.string().trim(),

    // «Одержувач — той самий клієнт» (TASK-2398). While it is ticked the
    // recipient fields below are not rendered and NOT judged: the client block
    // IS the recipient, copied into `shippingAddress` by `createOrderValuesToDto`.
    sameRecipient: z.boolean(),
    firstName: z.string().trim(),
    lastName: z.string().trim(),
    phone: z.string().trim(),
    // Required per method (TASK-1973) — see the refinement: a pickup order is
    // collected at the point, so it asks for the point, not for an address.
    city: z.string().trim().max(ADDRESS_LIMITS.city, dict.forms.tooLong),
    address1: z
      .string()
      .trim()
      .max(ADDRESS_LIMITS.address1, dict.forms.tooLong),
    postalCode: z
      .string()
      .trim()
      .max(ADDRESS_LIMITS.postalCode, dict.forms.tooLong),
    // Nova Poshta refs, filled only when the operator picked from the directory
    // (TASK-426). Free text stays fully supported — NP refuses keyless calls, so
    // an unavailable directory must not be able to block a phone order.
    npCityRef: z.string().trim(),
    npWarehouseRef: z.string().trim(),

    // TASK-1973: how the order travels. Every method the server knows; the form
    // offers only those the shop has switched on (GET /api/delivery/methods).
    deliveryMethod: z.enum(["NOVA_POSHTA", "PICKUP", "COURIER", "OTHER"]),
    pickupPointId: z.string().trim(),
    // TASK-1019: the cost agreed for «Інша доставка», as typed (comma or dot).
    // Empty = still to be agreed. Judged only while OTHER is the method.
    shippingCost: z.string().trim(),

    paymentMethod: z.string().min(1),
    // TASK-794: the messages are what the form renders under each field — a
    // bare `max()` blocked the submit with nothing on screen to say why.
    notes: z.string().trim().max(NOTES_MAX_LENGTH, t.notesTooLong),
    internalNotes: z
      .string()
      .trim()
      .max(INTERNAL_NOTES_MAX_LENGTH, t.internalNotesTooLong),
  })
  // The contact block is validated only in the mode that uses it, so switching
  // to «за телефоном» does not leave a stale account error on screen.
  .superRefine((values, ctx) => {
    refineDelivery(values, ctx);

    const judge = (path: string, rule: z.ZodTypeAny, value: string) => {
      const result = rule.safeParse(value);
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: result.error.issues[0]?.message ?? dict.forms.invalid,
        });
      }
    };

    const guest = values.customerMode === CUSTOMER_MODE.GUEST;
    if (!guest && !UUID_RE.test(values.userId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["userId"],
        message: t.customerRequired,
      });
    }

    // The client block. A walk-in's name and phone go to `contact`; in either
    // mode, while the checkbox is ticked, they are also the recipient — so they
    // carry the recipient's rules then (`AddressDto`: both names required).
    if (guest || values.sameRecipient) {
      judge(
        "contactFirstName",
        requiredName(guest ? t.contactNameInvalid : t.addressRequired),
        values.contactFirstName,
      );
      judge("contactPhone", contactPhoneRule, values.contactPhone);
    }
    judge(
      "contactLastName",
      values.sameRecipient ? requiredName(t.addressRequired) : optionalName,
      values.contactLastName,
    );
    if (guest) {
      // `GuestContactDto.name` is the two names joined — `@MaxLength(120)`,
      // tighter than the two `AddressDto` names (100 each) added up.
      if (
        contactFullName(values).length > CONTACT_NAME_MAX_LENGTH &&
        values.contactLastName !== ""
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["contactLastName"],
          message: t.contactNameTooLong(CONTACT_NAME_MAX_LENGTH),
        });
      }
      // Optional, but a typo is still a typo: an address that is present must
      // be one we could actually send the order-status link to.
      judge(
        "contactEmail",
        emailField({ optional: true, message: t.contactEmailInvalid }),
        values.contactEmail,
      );
    }

    // A different recipient (the checkbox off): the number on the parcel and
    // the name on it, judged by `AddressDto`'s rules in BOTH modes.
    if (!values.sameRecipient) {
      judge("firstName", requiredName(t.addressRequired), values.firstName);
      judge("lastName", requiredName(t.addressRequired), values.lastName);
      judge("phone", recipientPhoneRule, values.phone);
    }
  });

/** The walk-in's `contact.name`: both names, one space between. */
export function contactFullName(
  values: Pick<CreateOrderFormValues, "contactFirstName" | "contactLastName">,
): string {
  return [values.contactFirstName.trim(), values.contactLastName.trim()]
    .filter(Boolean)
    .join(" ");
}

export type CreateOrderFormValues = z.infer<typeof createOrderSchema>;

/**
 * The agreed OTHER cost as a number, or `null` when it is empty or not a sum
 * the API would take (TASK-1019) — the shared operator money rule.
 */
export const parseShippingCost = parseMoneyInput;

/**
 * What each delivery method needs before the order can go (TASK-1973):
 *
 * - NOVA_POSHTA — a city FROM THE DIRECTORY. The ref is what makes a waybill
 *   printable, and the API refuses NP without it (TASK-1020, «ref ⇔ not
 *   OTHER»). With the directory down, the operator picks «Інша доставка».
 * - PICKUP — a point; the address is the point's.
 * - COURIER / OTHER — a typed city and address; OTHER may carry a cost.
 */
function refineDelivery(
  values: {
    deliveryMethod: DeliveryMethod;
    city: string;
    address1: string;
    npCityRef: string;
    pickupPointId: string;
    shippingCost: string;
  },
  ctx: z.RefinementCtx,
): void {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  if (values.deliveryMethod === "PICKUP") {
    if (values.pickupPointId === "")
      issue("pickupPointId", t.deliveryPickupRequired);
    return;
  }

  if (values.city === "") issue("city", t.addressRequired);
  else if (values.deliveryMethod === "NOVA_POSHTA" && values.npCityRef === "") {
    issue("city", t.deliveryNpCityRequired);
  }
  if (values.address1 === "") issue("address1", t.addressRequired);

  if (
    values.deliveryMethod === "OTHER" &&
    values.shippingCost !== "" &&
    parseShippingCost(values.shippingCost) === null
  ) {
    issue("shippingCost", t.shippingCostInvalid);
  }
}

/**
 * The storefront's delivery × payment table, used only until
 * `GET /api/delivery/methods` has answered — the served `paymentMatrix` is the
 * truth (`delivery-payment-matrix.ts` on the API).
 */
const FALLBACK_MATRIX: Record<DeliveryMethod, readonly string[]> = {
  NOVA_POSHTA: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
  PICKUP: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
  COURIER: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
  OTHER: ["ON_DELIVERY"],
};

/**
 * The payment methods the OPERATOR may pick for `method` (TASK-1973): the
 * served storefront row plus «Переказ на рахунок ФОП», which the API's
 * `ADMIN_DELIVERY_PAYMENT_MATRIX` adds to every row (R2 A3).
 */
export function allowedPaymentMethods(
  method: DeliveryMethod,
  matrix: Partial<Record<DeliveryMethod, readonly string[]>> | undefined,
): string[] {
  const row = matrix?.[method] ?? FALLBACK_MATRIX[method];
  return [...row.filter((m) => m !== "BANK_TRANSFER"), "BANK_TRANSFER"];
}

/**
 * What the delivery adds to the phone order, as the summary shows it
 * (TASK-1808) — the API's rule (`OrderService.resolveManualDelivery`):
 *
 * - `carrier` — Nova Poshta: paid at the branch, not part of the total (B-13);
 * - `amount` — pickup (0), the courier's flat price (0 from its threshold), or
 *   the agreed OTHER cost;
 * - `pending` — OTHER with no cost yet: «узгодить оператор», nothing added.
 *   Also a courier whose terms are not loaded.
 */
export type ShippingQuote =
  | { kind: "carrier" }
  | { kind: "pending" }
  | { kind: "amount"; amount: number };

export function operatorShippingCost(
  values: Pick<CreateOrderFormValues, "deliveryMethod" | "shippingCost">,
  courier: Pick<CourierTermsDto, "price" | "freeFrom"> | undefined,
  goods: number,
): ShippingQuote {
  switch (values.deliveryMethod) {
    case "NOVA_POSHTA":
      return { kind: "carrier" };
    case "PICKUP":
      return { kind: "amount", amount: 0 };
    case "COURIER": {
      // Terms not loaded (or no courier offer): the server prices it — say
      // «узгодить оператор» rather than a «Безкоштовно» nobody decided (review R3).
      if (!courier) return { kind: "pending" };
      const freeFrom =
        courier?.freeFrom == null ? null : Number(courier.freeFrom);
      const free = freeFrom !== null && goods >= freeFrom;
      return { kind: "amount", amount: free ? 0 : Number(courier.price) };
    }
    case "OTHER": {
      const amount = parseShippingCost(values.shippingCost);
      return amount === null ? { kind: "pending" } : { kind: "amount", amount };
    }
  }
}

export const CREATE_ORDER_DEFAULTS: CreateOrderFormValues = {
  customerMode: CUSTOMER_MODE.GUEST,
  userId: "",
  contactFirstName: "",
  contactLastName: "",
  contactEmail: "",
  contactPhone: "",
  sameRecipient: true,
  firstName: "",
  lastName: "",
  phone: "",
  city: "",
  address1: "",
  postalCode: "",
  npCityRef: "",
  npWarehouseRef: "",
  deliveryMethod: "NOVA_POSHTA",
  pickupPointId: "",
  shippingCost: "",
  paymentMethod: "ON_DELIVERY",
  notes: "",
  internalNotes: "",
};

/**
 * Map the form plus the picked lines into the create payload.
 *
 * Exactly one of `userId` / `contact` is sent — never both, never neither. The
 * server rejects an order it cannot reach anyone about, and sending a blank
 * `contact` alongside a `userId` would be that rejection arriving for a reason
 * the operator did not cause.
 *
 * Phone numbers travel exactly as the operator typed them, separators and all:
 * the API normalises every phone at the boundary (`normalizePhone`, TASK-466),
 * so one number reaches the column in one shape whichever client sent it.
 * Normalising here as well would just be a second place to keep in sync — and a
 * client-side normaliser is precisely what would re-introduce a Ukrainian
 * assumption on a field that must carry a foreign number.
 */
export function createOrderValuesToDto(
  values: CreateOrderFormValues,
  lines: readonly DraftLine[],
  /**
   * The picked pickup point (TASK-1973): a pickup order is collected there, so
   * its city and address are the point's — the server overwrites them anyway,
   * but `AddressDto` refuses an empty city or address line.
   */
  pickupPoint?: { city: string; address: string },
  /** «Створити копію» (TASK-2048): the original, and whether it is cancelled. */
  copy?: { copyOfOrderId: string; cancelOriginal: boolean },
): CreateManualOrderDto {
  const optional = (value: string) => (value === "" ? undefined : value);
  const isNp = values.deliveryMethod === "NOVA_POSHTA";
  const atPoint = values.deliveryMethod === "PICKUP" ? pickupPoint : undefined;
  const agreedCost = parseShippingCost(values.shippingCost);
  // TASK-2398: «той самий клієнт» copies the client block at submit — here, in
  // the payload, never into the hidden recipient fields (which would then show
  // stale values once the checkbox is unticked).
  const recipient = values.sameRecipient
    ? {
        firstName: values.contactFirstName,
        lastName: values.contactLastName,
        phone: values.contactPhone,
      }
    : {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
      };

  return {
    ...(values.customerMode === CUSTOMER_MODE.ACCOUNT
      ? { userId: values.userId }
      : {
          contact: {
            name: contactFullName(values),
            phone: values.contactPhone,
            // Omitted rather than sent empty (TASK-426): `''` is not an address,
            // and the DTO would have to guess which of the two we meant.
            ...(optional(values.contactEmail)
              ? { email: values.contactEmail }
              : {}),
          },
        }),
    shippingAddress: {
      ...recipient,
      city: atPoint?.city ?? values.city,
      address1: atPoint?.address ?? values.address1,
      ...(optional(values.postalCode) ? { postalCode: values.postalCode } : {}),
      // The NP refs are what makes a waybill printable later; they exist only for
      // an address chosen from the directory, and only on a Nova Poshta order —
      // a stale ref on another method would make it read as a parcel.
      ...(isNp && optional(values.npCityRef)
        ? { npCityRef: values.npCityRef }
        : {}),
      ...(isNp && optional(values.npWarehouseRef)
        ? {
            npWarehouseRef: values.npWarehouseRef,
            npWarehouseName: values.address1,
          }
        : {}),
    },
    // TASK-1973: the method is always explicit — the server no longer has to
    // guess it from the address.
    deliveryMethod: values.deliveryMethod,
    ...(values.deliveryMethod === "PICKUP" && optional(values.pickupPointId)
      ? { pickupPointId: values.pickupPointId }
      : {}),
    // TASK-1019: only OTHER carries an agreed cost; empty = still to agree.
    ...(values.deliveryMethod === "OTHER" && agreedCost !== null
      ? { shippingCost: agreedCost }
      : {}),
    // Price is absent on purpose — the catalogue decides it (see the schema).
    items: lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
    })),
    paymentMethod:
      values.paymentMethod as CreateManualOrderDto["paymentMethod"],
    ...(optional(values.notes) ? { notes: values.notes } : {}),
    ...(optional(values.internalNotes)
      ? { internalNotes: values.internalNotes }
      : {}),
    ...(copy
      ? {
          copyOfOrderId: copy.copyOfOrderId,
          cancelOriginal: copy.cancelOriginal,
        }
      : {}),
  };
}
