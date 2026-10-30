import { novaPoshtaTrackingUrl } from "./tracking";

describe("novaPoshtaTrackingUrl (TASK-1987)", () => {
  it("puts the waybill in the path, the only form NP's page still fills in", () => {
    expect(novaPoshtaTrackingUrl("20450123456789")).toBe(
      "https://novaposhta.ua/tracking/20450123456789",
    );
  });

  it("keeps digits only, so an operator-typed number cannot leave the path", () => {
    expect(novaPoshtaTrackingUrl(" 2045 0123/../x?y#z ")).toBe(
      "https://novaposhta.ua/tracking/20450123",
    );
  });

  it.each([["ТТН уточнюється"], ["  "], [""]])(
    "gives no link for %p, which holds no digits at all",
    (raw) => {
      expect(novaPoshtaTrackingUrl(raw)).toBeNull();
    },
  );
});
