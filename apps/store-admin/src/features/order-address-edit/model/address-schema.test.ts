import { dict } from "@/shared/config";
import {
  addressValuesToDto,
  deliveryEditToDto,
  mapOrderToAddressValues,
  orderAddressSchema,
} from "./address-schema";

const CURRENT = {
  firstName: "Олена",
  lastName: "Шевченко",
  phone: "+380501234567",
  city: "Київ",
  address1: "Відділення №12",
  postalCode: "01001",
  country: "UA",
  npCityRef: "np-city-ref-uuid",
  npWarehouseName: "Відділення №12",
  npWarehouseRef: "np-warehouse-ref-uuid",
};

describe("mapOrderToAddressValues (TASK-341)", () => {
  it("reads the editable fields off the untyped address snapshot", () => {
    expect(mapOrderToAddressValues({ shippingAddress: CURRENT })).toEqual({
      firstName: "Олена",
      lastName: "Шевченко",
      phone: "+380501234567",
      city: "Київ",
      address1: "Відділення №12",
      postalCode: "01001",
      // TASK-1973: a legacy payload without a method reads as Nova Poshta.
      deliveryMethod: "NOVA_POSHTA",
      pickupPointId: "",
      shippingCost: "",
    });
  });

  it("produces empty controlled strings for a missing address", () => {
    expect(mapOrderToAddressValues({ shippingAddress: null })).toEqual({
      firstName: "",
      lastName: "",
      phone: "",
      city: "",
      address1: "",
      postalCode: "",
      deliveryMethod: "NOVA_POSHTA",
      pickupPointId: "",
      shippingCost: "",
    });
  });

  it("ignores a non-string value rather than putting an object in an input", () => {
    expect(
      // A corrupt snapshot the generated type rules out — cast to reach the guard.
      mapOrderToAddressValues({
        shippingAddress: { city: { nested: true } } as never,
      }).city,
    ).toBe("");
  });
});

describe("addressValuesToDto — the write replaces the whole address (TASK-341)", () => {
  it("carries over the fields the form does not edit", () => {
    // The regression this guards: correcting a typo in the recipient's name
    // silently deleting the Nova Poshta warehouse reference the courier
    // integration depends on, because the PATCH replaces the object wholesale.
    const dto = addressValuesToDto(
      {
        ...mapOrderToAddressValues({ shippingAddress: CURRENT }),
        lastName: "Шевченкo",
      },
      CURRENT,
    );

    expect(dto.npCityRef).toBe("np-city-ref-uuid");
    expect(dto.npWarehouseRef).toBe("np-warehouse-ref-uuid");
    expect(dto.npWarehouseName).toBe("Відділення №12");
    expect(dto.country).toBe("UA");
    expect(dto.lastName).toBe("Шевченкo");
  });

  it("omits carry-over keys that were absent or blank", () => {
    const dto = addressValuesToDto(
      mapOrderToAddressValues({ shippingAddress: CURRENT }),
      { city: "Київ" },
    );

    expect(dto).not.toHaveProperty("npCityRef");
    expect(dto).not.toHaveProperty("company");
  });

  it("omits an empty postal code instead of sending an empty string", () => {
    const dto = addressValuesToDto(
      {
        ...mapOrderToAddressValues({ shippingAddress: CURRENT }),
        postalCode: "",
      },
      CURRENT,
    );

    expect(dto).not.toHaveProperty("postalCode");
  });
});

describe("orderAddressSchema — phone as the API judges it (TASK-577)", () => {
  const valid = mapOrderToAddressValues({ shippingAddress: CURRENT });

  function phoneIssue(phone: string) {
    const result = orderAddressSchema.safeParse({ ...valid, phone });
    return result.success
      ? undefined
      : result.error.issues.find((issue) => issue.path[0] === "phone")?.message;
  }

  it("refuses a number the API would refuse, with the message under the field", () => {
    expect(phoneIssue("123")).toBe(dict.orderCreate.contactPhoneInvalid);
    expect(phoneIssue("(((((((((")).toBe(dict.orderCreate.contactPhoneInvalid);
  });

  it("keeps «required» for an empty value", () => {
    expect(phoneIssue("")).toBe(dict.orderCreate.addressRequired);
  });

  it("accepts Ukrainian and foreign numbers, as @IsInternationalPhone does", () => {
    expect(phoneIssue("+380501234567")).toBeUndefined();
    expect(phoneIssue("0501234567")).toBeUndefined();
    expect(phoneIssue("+48 123 456 789")).toBeUndefined();
  });
});

// ─── TASK-1973 / 1806 / 1020 / AD-ORD-86: delivery, not only the address ──────

const POINT = {
  id: "6f1c1f4e-6d8c-4c86-9d57-2a3f5f0c9a11",
  city: "Київ",
  address: "вул. Хрещатик, 1",
};
const OTHER_POINT = {
  id: "7a2d2e5f-7e9d-4d97-8e68-3b4f6a1d0b22",
  city: "Київ",
  address: "вул. Сагайдачного, 5",
};

const PICKUP_ORDER = {
  deliveryMethod: "PICKUP" as const,
  pickupPointId: POINT.id,
  shippingCost: "0.00",
  shippingAddress: {
    firstName: "Олена",
    lastName: "Шевченко",
    phone: "+380501234567",
    city: "Київ",
    address1: "вул. Хрещатик, 1",
    deliveryMethod: "PICKUP" as const,
    carrier: null,
    pickupPointName: "Магазин на Хрещатику",
    pickupPointAddress: "вул. Хрещатик, 1",
  },
};
const NP_ORDER = {
  deliveryMethod: "NOVA_POSHTA" as const,
  pickupPointId: null,
  shippingCost: "0.00",
  shippingAddress: CURRENT,
};
const otherOrder = (shippingCost: string, pending: boolean) => ({
  deliveryMethod: "OTHER" as const,
  pickupPointId: null,
  shippingCost,
  shippingAddress: {
    ...CURRENT,
    npCityRef: undefined,
    npWarehouseRef: undefined,
    deliveryMethod: "OTHER" as const,
    ...(pending ? { shippingCostPending: true } : {}),
  },
});

describe("mapOrderToAddressValues — the delivery (TASK-1973)", () => {
  it("seeds the method and the point of a pickup order", () => {
    expect(mapOrderToAddressValues(PICKUP_ORDER)).toMatchObject({
      deliveryMethod: "PICKUP",
      pickupPointId: POINT.id,
      shippingCost: "",
    });
  });

  it("seeds an agreed OTHER cost, and leaves a pending one empty", () => {
    expect(
      mapOrderToAddressValues(otherOrder("150.00", false)).shippingCost,
    ).toBe("150.00");
    expect(mapOrderToAddressValues(otherOrder("0.00", true)).shippingCost).toBe(
      "",
    );
  });
});

describe("orderAddressSchema — per method (TASK-1806)", () => {
  const base = mapOrderToAddressValues(NP_ORDER);
  const issue = (values: Record<string, string>, path: string) =>
    orderAddressSchema
      .safeParse({ ...base, ...values })
      .error?.issues.find((i) => i.path[0] === path)?.message;

  it("asks a pickup order for its point, not for an address", () => {
    const values = { deliveryMethod: "PICKUP", city: "", address1: "" };
    expect(issue(values, "pickupPointId")).toBe(
      dict.orderCreate.deliveryPickupRequired,
    );
    expect(issue(values, "city")).toBeUndefined();
  });

  it("refuses an agreed cost the API would refuse", () => {
    expect(
      issue({ deliveryMethod: "OTHER", shippingCost: "-5" }, "shippingCost"),
    ).toBe(dict.orderCreate.shippingCostInvalid);
    expect(
      issue({ deliveryMethod: "OTHER", shippingCost: "120,5" }, "shippingCost"),
    ).toBeUndefined();
  });
});

describe("deliveryEditToDto — what the PATCH carries (TASK-1973 / 1020)", () => {
  it("edits the contacts of a pickup order without touching the point or the money", () => {
    const values = {
      ...mapOrderToAddressValues(PICKUP_ORDER),
      firstName: "Ірина",
    };

    const dto = deliveryEditToDto(values, PICKUP_ORDER);

    expect(dto).not.toHaveProperty("deliveryMethod");
    expect(dto).not.toHaveProperty("pickupPointId");
    expect(dto).not.toHaveProperty("shippingCost");
    expect(dto.shippingAddress).toMatchObject({
      firstName: "Ірина",
      city: "Київ",
      address1: "вул. Хрещатик, 1",
    });
  });

  it("moves a pickup order to another point", () => {
    const values = {
      ...mapOrderToAddressValues(PICKUP_ORDER),
      pickupPointId: OTHER_POINT.id,
    };

    const dto = deliveryEditToDto(values, PICKUP_ORDER, OTHER_POINT);

    expect(dto.pickupPointId).toBe(OTHER_POINT.id);
    expect(dto).not.toHaveProperty("deliveryMethod");
    expect(dto.shippingAddress.address1).toBe("вул. Сагайдачного, 5");
  });

  it("moves a Nova Poshta order to pickup — the NP refs stay behind", () => {
    const values = {
      ...mapOrderToAddressValues(NP_ORDER),
      deliveryMethod: "PICKUP",
      pickupPointId: POINT.id,
    };

    const dto = deliveryEditToDto(values, NP_ORDER, POINT);

    expect(dto).toMatchObject({
      deliveryMethod: "PICKUP",
      pickupPointId: POINT.id,
    });
    expect(dto.shippingAddress).not.toHaveProperty("npCityRef");
    expect(dto.shippingAddress).not.toHaveProperty("npWarehouseRef");
    expect(dto.shippingAddress.city).toBe("Київ");
  });

  it("moves a Nova Poshta order to OTHER with an agreed cost", () => {
    const values = {
      ...mapOrderToAddressValues(NP_ORDER),
      deliveryMethod: "OTHER",
      shippingCost: "90",
    };

    const dto = deliveryEditToDto(values, NP_ORDER);

    expect(dto).toMatchObject({ deliveryMethod: "OTHER", shippingCost: 90 });
    expect(dto.shippingAddress).not.toHaveProperty("npCityRef");
  });

  it("quotes an OTHER order (AD-ORD-86), and does not re-send an unchanged cost", () => {
    const pending = otherOrder("0.00", true);
    expect(
      deliveryEditToDto(
        { ...mapOrderToAddressValues(pending), shippingCost: "180" },
        pending,
      ).shippingCost,
    ).toBe(180);

    const quoted = otherOrder("180.00", false);
    expect(
      deliveryEditToDto(mapOrderToAddressValues(quoted), quoted),
    ).not.toHaveProperty("shippingCost");
  });

  it("keeps the NP refs of a Nova Poshta order whose contacts change", () => {
    const dto = deliveryEditToDto(
      { ...mapOrderToAddressValues(NP_ORDER), phone: "+380671112233" },
      NP_ORDER,
    );

    expect(dto.shippingAddress.npCityRef).toBe("np-city-ref-uuid");
    expect(dto).not.toHaveProperty("deliveryMethod");
  });
});
