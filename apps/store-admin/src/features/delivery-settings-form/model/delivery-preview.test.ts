import { dict } from "@/shared/config";
import { buildDeliveryPreview } from "./delivery-preview";

const t = dict.deliverySettingsForm;

const ALL_ON = {
  npEnabled: true,
  pickupEnabled: true,
  courierEnabled: true,
  otherEnabled: true,
  courierCityName: "Київ",
  courierPrice: "150",
  courierFreeFrom: "2000",
};

describe("buildDeliveryPreview (ДН-1.1 «Так побачить покупець на чекауті»)", () => {
  it("lists the switched-on methods in the order of the cards", () => {
    const rows = buildDeliveryPreview(ALL_ON, 2);
    expect(rows.map((row) => row.method)).toEqual([
      "np",
      "pickup",
      "courier",
      "other",
    ]);
    expect(rows[0]).toMatchObject({ title: t.npTitle, line: t.previewNp });
    expect(rows[3]).toMatchObject({
      title: t.otherTitle,
      line: t.previewOther,
    });
  });

  it("names the courier by its city and states price and threshold", () => {
    const [courier] = buildDeliveryPreview(
      {
        ...ALL_ON,
        npEnabled: false,
        pickupEnabled: false,
        otherEnabled: false,
      },
      null,
    );
    expect(courier.title).toBe("Курʼєр · Київ");
    // uk-UA groups thousands with a no-break space.
    expect(courier.line.replace(/\s/g, " ")).toBe(
      "150 ₴ · безкоштовно від 2 000 ₴",
    );
  });

  it("falls back to «Курʼєр по місту» and prints the bare price without a threshold", () => {
    const [courier] = buildDeliveryPreview(
      {
        ...ALL_ON,
        npEnabled: false,
        pickupEnabled: false,
        otherEnabled: false,
        courierCityName: " ",
        courierFreeFrom: "",
      },
      null,
    );
    expect(courier.title).toBe(t.courierTitle);
    expect(courier.line).toBe("150 ₴");
  });

  it("shows pickup only with at least one active point", () => {
    const methods = (points: number | null) =>
      buildDeliveryPreview(ALL_ON, points).map((row) => row.method);
    expect(methods(0)).not.toContain("pickup");
    expect(methods(null)).not.toContain("pickup");
    expect(buildDeliveryPreview(ALL_ON, 1)[1].line).toBe(
      "Безкоштовно · 1 точка",
    );
    expect(buildDeliveryPreview(ALL_ON, 3)[1].line).toBe(
      "Безкоштовно · 3 точки",
    );
  });

  it("is empty when everything is off", () => {
    expect(
      buildDeliveryPreview(
        {
          ...ALL_ON,
          npEnabled: false,
          pickupEnabled: false,
          courierEnabled: false,
          otherEnabled: false,
        },
        5,
      ),
    ).toEqual([]);
  });
});
