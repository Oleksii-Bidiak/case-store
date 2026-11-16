import type { OrderCopyDraftEntity } from "@/entities/order";
import {
  CREATE_ORDER_DEFAULTS,
  CUSTOMER_MODE,
  createOrderSchema,
  createOrderValuesToDto,
} from "./create-order-schema";
import {
  copyDraftCustomer,
  copyDraftLines,
  copyDraftToFormValues,
} from "./copy-draft";

const SOURCE = "7c1e9a42-0000-4000-8000-000000000001";

function draft(
  overrides: Partial<OrderCopyDraftEntity> = {},
): OrderCopyDraftEntity {
  return {
    sourceOrderId: SOURCE,
    sourceStatus: "PROCESSING",
    canCancelOriginal: true,
    userId: null,
    customer: null,
    contact: {
      name: "Олена Коваль",
      phone: "380501234567",
      email: "olena@example.com",
    },
    paymentMethod: "ON_DELIVERY",
    deliveryMethod: "NOVA_POSHTA",
    pickupPointId: null,
    shippingAddress: {
      firstName: "Олена",
      lastName: "Коваль",
      phone: "+380501234567",
      city: "Київ",
      address1: "Відділення №12",
      postalCode: null,
      npCityRef: "city-ref",
      npWarehouseRef: "wh-ref",
    },
    shippingCost: null,
    notes: "Подзвонити",
    items: [
      {
        productId: "p-1",
        productName: "Чохол",
        sku: "CASE-1",
        price: "549.00",
        quantity: 2,
        stock: 3,
      },
    ],
    dropped: [],
    heldKop: 0,
    ...overrides,
  } as OrderCopyDraftEntity;
}

/** TASK-2048: «Створити копію» — the original, as the create form starts. */
describe("copyDraftToFormValues", () => {
  it("prefills a walk-in's contact, the Nova Poshta destination and the note", () => {
    expect(copyDraftToFormValues(draft())).toEqual({
      ...CREATE_ORDER_DEFAULTS,
      customerMode: CUSTOMER_MODE.GUEST,
      contactFirstName: "Олена",
      contactLastName: "Коваль",
      contactEmail: "olena@example.com",
      contactPhone: "+380501234567",
      sameRecipient: true,
      city: "Київ",
      address1: "Відділення №12",
      npCityRef: "city-ref",
      npWarehouseRef: "wh-ref",
      deliveryMethod: "NOVA_POSHTA",
      paymentMethod: "ON_DELIVERY",
      notes: "Подзвонити",
    });
  });

  it("keeps a different recipient apart from the client", () => {
    const values = copyDraftToFormValues(
      draft({
        shippingAddress: {
          ...draft().shippingAddress!,
          firstName: "Іван",
          lastName: "Петренко",
          phone: "+380671112233",
        },
      }),
    );

    expect(values).toMatchObject({
      sameRecipient: false,
      firstName: "Іван",
      lastName: "Петренко",
      phone: "+380671112233",
    });
  });

  it("names the account of an account order", () => {
    const values = copyDraftToFormValues(
      draft({
        userId: "u-1",
        contact: null,
        customer: {
          id: "u-1",
          email: "olena@example.com",
          firstName: "Олена",
          lastName: "Коваль",
          phone: "+380501234567",
        },
      }),
    );

    expect(values).toMatchObject({
      customerMode: CUSTOMER_MODE.ACCOUNT,
      userId: "u-1",
      contactFirstName: "Олена",
      contactLastName: "Коваль",
      contactPhone: "+380501234567",
      sameRecipient: true,
    });
  });

  it("takes the point of a pickup order and the agreed cost of an OTHER one", () => {
    expect(
      copyDraftToFormValues(
        draft({ deliveryMethod: "PICKUP", pickupPointId: "pt-1" }),
      ),
    ).toMatchObject({ deliveryMethod: "PICKUP", pickupPointId: "pt-1" });
    expect(
      copyDraftToFormValues(
        draft({ deliveryMethod: "OTHER", shippingCost: "150.00" }),
      ),
    ).toMatchObject({ deliveryMethod: "OTHER", shippingCost: "150.00" });
  });

  it("is a form the schema accepts as it stands", () => {
    expect(
      createOrderSchema.safeParse(copyDraftToFormValues(draft())).success,
    ).toBe(true);
  });
});

describe("copyDraftLines / copyDraftCustomer", () => {
  it("turns the copied lines into picked lines at today's price", () => {
    expect(copyDraftLines(draft())).toEqual([
      {
        productId: "p-1",
        productName: "Чохол",
        sku: "CASE-1",
        price: "549.00",
        quantity: 2,
        stock: 3,
      },
    ]);
  });

  it("names the picked account, or nobody for a walk-in", () => {
    expect(copyDraftCustomer(draft())).toBeNull();
    expect(
      copyDraftCustomer(
        draft({
          userId: "u-1",
          customer: {
            id: "u-1",
            email: "olena@example.com",
            firstName: "Олена",
            lastName: null,
            phone: null,
          },
        }),
      ),
    ).toEqual({
      id: "u-1",
      name: "Олена",
      firstName: "Олена",
      lastName: "",
      email: "olena@example.com",
      phone: "",
      isActive: true,
    });
  });
});

describe("createOrderValuesToDto — copy", () => {
  it("sends the original and the cancel choice", () => {
    const values = copyDraftToFormValues(draft());
    const dto = createOrderValuesToDto(
      values,
      copyDraftLines(draft()),
      undefined,
      {
        copyOfOrderId: SOURCE,
        cancelOriginal: true,
      },
    );

    expect(dto).toMatchObject({ copyOfOrderId: SOURCE, cancelOriginal: true });
  });

  it("sends neither on an ordinary phone order", () => {
    const dto = createOrderValuesToDto(
      copyDraftToFormValues(draft()),
      copyDraftLines(draft()),
    );

    expect(dto).not.toHaveProperty("copyOfOrderId");
    expect(dto).not.toHaveProperty("cancelOriginal");
  });
});
