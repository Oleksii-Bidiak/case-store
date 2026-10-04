import {
  MESSAGE_COLUMNS_WIDTH_BUDGET,
  buildMessageColumns,
} from "./message-inbox";

const columns = () =>
  buildMessageColumns({ onOpen: () => {}, canReadOrders: true });

describe("inbox columns — default widths (wave 198, З1 at 1440)", () => {
  it("fit the 1440 content area with the checkbox and «⋯» columns", () => {
    const visible = columns().filter(
      (column) => column.defaultVisible !== false,
    );
    const total = visible.reduce(
      (sum, column) => sum + (column.defaultWidth ?? 0),
      0,
    );

    expect(visible.every((column) => column.defaultWidth !== undefined)).toBe(
      true,
    );
    expect(total).toBeLessThanOrEqual(MESSAGE_COLUMNS_WIDTH_BUDGET);
    expect(MESSAGE_COLUMNS_WIDTH_BUDGET).toBe(1136 - 36 - 44 - 2);
  });

  /**
   * TASK-734: the message column has a width of its own and a floor, so the
   * text wraps (and clamps) inside it instead of pushing «Статус» aside.
   */
  it("gives the message text a fixed column", () => {
    const message = columns().find((column) => column.id === "message");
    expect(message?.defaultWidth).toBe(320);
    expect(message?.minWidth).toBeGreaterThanOrEqual(200);
  });
});
