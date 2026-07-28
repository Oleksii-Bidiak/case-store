import { addressValuesToDto, mapOrderToAddressValues } from "./address-schema";

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
    });
  });

  it("ignores a non-string value rather than putting an object in an input", () => {
    expect(
      mapOrderToAddressValues({ shippingAddress: { city: { nested: true } } })
        .city,
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
