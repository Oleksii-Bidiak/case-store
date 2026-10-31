import { dict } from "@/shared/config";
import {
  REPAIR_DEFAULT_VALUES,
  createRepairSchema,
  repairValuesToDto,
} from "./repair-schema";

const d = dict.returns;

const messages = (
  result: ReturnType<ReturnType<typeof createRepairSchema>["safeParse"]>,
) => (result.success ? [] : result.error.issues.map((issue) => issue.message));

describe("createRepairSchema (TASK-2045)", () => {
  it("lets «accepted» through with nothing but an optional note", () => {
    expect(
      createRepairSchema("ACCEPTED").safeParse(REPAIR_DEFAULT_VALUES).success,
    ).toBe(true);
  });

  it("requires the outcome when the item comes back from the service", () => {
    const result = createRepairSchema("RETURNED_FROM_SERVICE").safeParse(
      REPAIR_DEFAULT_VALUES,
    );
    expect(messages(result)).toEqual([d.repairResultRequired]);
  });

  it("caps the waybill as the DTO does, after trimming", () => {
    const ok = createRepairSchema("SENT_TO_SERVICE").safeParse({
      ...REPAIR_DEFAULT_VALUES,
      ttn: `  ${"1".repeat(64)}  `,
    });
    expect(ok.success).toBe(true);

    const tooLong = createRepairSchema("SENT_TO_SERVICE").safeParse({
      ...REPAIR_DEFAULT_VALUES,
      ttn: "1".repeat(65),
    });
    expect(messages(tooLong)).toEqual([d.repairTtnTooLong]);
  });

  it("caps the note on every step", () => {
    const result = createRepairSchema("ACCEPTED").safeParse({
      ...REPAIR_DEFAULT_VALUES,
      note: "x".repeat(2001),
    });
    expect(messages(result)).toEqual([d.repairNoteTooLong]);
  });
});

describe("repairValuesToDto", () => {
  it("sends only what the step carries, trimmed, blank as null", () => {
    expect(
      repairValuesToDto("SENT_TO_SERVICE", {
        result: "REPAIRED",
        destination: "  iCenter, Київ ",
        ttn: "",
        note: " ",
      }),
    ).toEqual({
      step: "SENT_TO_SERVICE",
      destination: "iCenter, Київ",
      ttn: null,
      note: null,
    });
  });

  it("sends the outcome on the step back from the service", () => {
    expect(
      repairValuesToDto("RETURNED_FROM_SERVICE", {
        ...REPAIR_DEFAULT_VALUES,
        result: "UNREPAIRABLE",
        note: "Плата не ремонтується",
      }),
    ).toEqual({
      step: "RETURNED_FROM_SERVICE",
      result: "UNREPAIRABLE",
      note: "Плата не ремонтується",
    });
  });

  it("sends the waybill or the pickup point on the handover", () => {
    expect(
      repairValuesToDto("HANDED_TO_CUSTOMER", {
        ...REPAIR_DEFAULT_VALUES,
        destination: "Магазин на Хрещатику",
      }),
    ).toEqual({
      step: "HANDED_TO_CUSTOMER",
      ttn: null,
      destination: "Магазин на Хрещатику",
      note: null,
    });
  });
});
