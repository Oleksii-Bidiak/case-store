import { z } from "zod";
import type { CreateManualOrderDto } from "@/entities/order";
import { dict } from "@/shared/config";

const t = dict.orderCreate;

/** A line the operator has picked, carrying enough to render it back. */
export interface DraftLine {
  readonly productId: string;
  readonly productName: string;
  /** Catalogue price at pick time — DISPLAY ONLY. Never sent. */
  readonly price: string;
  readonly quantity: number;
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
 * (TASK-341).
 *
 * There is deliberately NO price field anywhere in this schema, mirroring the
 * backend DTO. An operator-created order is still a sale at the shop's price;
 * accepting a price here would make every discount a matter of whoever happens
 * to be on the phone, and would leave no record that one was given.
 */
export const createOrderSchema = z
  .object({
    customerMode: z.enum([CUSTOMER_MODE.ACCOUNT, CUSTOMER_MODE.GUEST]),
    userId: z.string().trim(),
    contactName: z.string().trim(),
    contactEmail: z.string().trim(),
    contactPhone: z.string().trim(),

    firstName: z.string().trim().min(1, t.addressRequired),
    lastName: z.string().trim().min(1, t.addressRequired),
    phone: z.string().trim().min(1, t.addressRequired),
    city: z.string().trim().min(1, t.addressRequired),
    address1: z.string().trim().min(1, t.addressRequired),
    postalCode: z.string().trim(),

    paymentMethod: z.string().min(1),
    notes: z.string().trim().max(500),
    internalNotes: z.string().trim().max(2000),
  })
  // The contact block is validated only in the mode that uses it, so switching
  // to «за телефоном» does not leave a stale UUID error on screen.
  .superRefine((values, ctx) => {
    if (values.customerMode === CUSTOMER_MODE.ACCOUNT) {
      if (!UUID_RE.test(values.userId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["userId"],
          message: t.userIdInvalid,
        });
      }
      return;
    }

    if (values.contactName === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactName"],
        message: t.contactNameInvalid,
      });
    }
    if (!/^\S+@\S+\.\S+$/.test(values.contactEmail)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactEmail"],
        message: t.contactEmailInvalid,
      });
    }
    if (values.contactPhone.length < 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactPhone"],
        message: t.contactPhoneInvalid,
      });
    }
  });

export type CreateOrderFormValues = z.infer<typeof createOrderSchema>;

export const CREATE_ORDER_DEFAULTS: CreateOrderFormValues = {
  customerMode: CUSTOMER_MODE.GUEST,
  userId: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  firstName: "",
  lastName: "",
  phone: "",
  city: "",
  address1: "",
  postalCode: "",
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
 */
export function createOrderValuesToDto(
  values: CreateOrderFormValues,
  lines: readonly DraftLine[],
): CreateManualOrderDto {
  const optional = (value: string) => (value === "" ? undefined : value);

  return {
    ...(values.customerMode === CUSTOMER_MODE.ACCOUNT
      ? { userId: values.userId }
      : {
          contact: {
            name: values.contactName,
            email: values.contactEmail,
            phone: values.contactPhone,
          },
        }),
    shippingAddress: {
      firstName: values.firstName,
      lastName: values.lastName,
      phone: values.phone,
      city: values.city,
      address1: values.address1,
      ...(optional(values.postalCode) ? { postalCode: values.postalCode } : {}),
    },
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
  };
}
