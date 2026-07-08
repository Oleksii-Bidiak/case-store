import { OrderEntityStatus } from "@/shared/api";
import { isPreShipmentStatus } from "./is-pre-shipment-status";

/**
 * TASK-254: table-driven over all 7 OrderEntityStatus values so a status added
 * to one side (backend PRE_SHIPMENT_STATUSES vs. this mirror) without the other
 * surfaces here as a failing row.
 */
describe("isPreShipmentStatus", () => {
  const cases: Array<[string, boolean]> = [
    [OrderEntityStatus.PENDING, true],
    [OrderEntityStatus.CONFIRMED, true],
    [OrderEntityStatus.PROCESSING, true],
    [OrderEntityStatus.SHIPPED, false],
    [OrderEntityStatus.DELIVERED, false],
    [OrderEntityStatus.CANCELLED, false],
    [OrderEntityStatus.REFUNDED, false],
  ];

  it.each(cases)("%s → %s", (status, expected) => {
    expect(isPreShipmentStatus(status)).toBe(expected);
  });
});
