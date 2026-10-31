import { dict } from "@/shared/config";
import { formatDate } from "@/shared/lib";
import { returnSteps, type ReturnStepsSource } from "./return-steps";

const d = dict.returns;

const REQUESTED_AT = "2026-10-01T10:00:00.000Z";
const APPROVED_AT = "2026-10-02T10:00:00.000Z";
const CHANGED_AT = "2026-10-09T10:00:00.000Z";
const RESTOCKED_AT = "2026-10-05T10:00:00.000Z";
const LAST_CHANGE_AT = "2026-10-12T10:00:00.000Z";

function source(overrides: Partial<ReturnStepsSource> = {}): ReturnStepsSource {
  return {
    status: "APPROVED",
    requestedAt: REQUESTED_AT,
    // `resolvedAt` is the LAST change of any kind — a repair step bumps it too.
    resolvedAt: LAST_CHANGE_AT,
    decidedAt: APPROVED_AT,
    restockedAt: null,
    decisionHistory: [
      {
        decision: "REFUND",
        reason: null,
        legacy: false,
        createdAt: APPROVED_AT,
        actor: null,
      },
    ],
    ...overrides,
  };
}

const descriptions = (steps: ReturnType<typeof returnSteps>) =>
  steps.map((step) => step.description);

describe("returnSteps — the dates on the path (TASK-1961, AD-RET-05/06)", () => {
  it("dates «Схвалено» with the decision, not with the last change", () => {
    expect(descriptions(returnSteps(source()))).toEqual([
      formatDate(REQUESTED_AT),
      formatDate(APPROVED_AT),
      d.stepNow,
      undefined,
    ]);
  });

  it("keeps the approval date when a later positive decision replaced it", () => {
    // REFUND on the 2nd, changed to REPAIR on the 9th: approved on the 2nd.
    const steps = returnSteps(
      source({
        decidedAt: CHANGED_AT,
        decisionHistory: [
          {
            decision: "REFUND",
            reason: null,
            legacy: false,
            createdAt: APPROVED_AT,
            actor: null,
          },
          {
            decision: "REPAIR",
            reason: "Клієнт погодився на ремонт",
            legacy: false,
            createdAt: CHANGED_AT,
            actor: null,
          },
        ],
      }),
    );
    expect(steps[1].description).toBe(formatDate(APPROVED_AT));
  });

  it("dates a re-opened refusal from the decision that re-opened it", () => {
    const steps = returnSteps(
      source({
        decidedAt: CHANGED_AT,
        decisionHistory: [
          {
            decision: "REJECT",
            reason: "Сліди удару",
            legacy: false,
            createdAt: APPROVED_AT,
            actor: null,
          },
          {
            decision: "REFUND",
            reason: "Сервіс підтвердив заводський брак",
            legacy: false,
            createdAt: CHANGED_AT,
            actor: null,
          },
        ],
      }),
    );
    expect(steps[1].description).toBe(formatDate(CHANGED_AT));
  });

  it("falls back to `decidedAt` without a history (list responses omit it)", () => {
    const steps = returnSteps(source({ decisionHistory: undefined }));
    expect(steps[1].description).toBe(formatDate(APPROVED_AT));
  });

  it("dates «Відхилено» with the decision", () => {
    const steps = returnSteps(
      source({ status: "REJECTED", decidedAt: CHANGED_AT }),
    );
    expect(steps).toHaveLength(2);
    expect(steps[1].title).toBe(d.statusREJECTED);
    expect(steps[1].description).toBe(formatDate(CHANGED_AT));
  });

  it("dates «Товар отримано» only by the restock — `resolvedAt` moves on later steps", () => {
    expect(
      returnSteps(source({ status: "RECEIVED", restockedAt: RESTOCKED_AT }))[2]
        .description,
    ).toBe(formatDate(RESTOCKED_AT));
    expect(
      returnSteps(source({ status: "RECEIVED" }))[2].description,
    ).toBeUndefined();
  });

  it("dates «Гроші повернуто» with the last change — nothing follows a refund", () => {
    const steps = returnSteps(
      source({ status: "REFUNDED", restockedAt: RESTOCKED_AT }),
    );
    expect(steps.map((step) => step.state)).toEqual([
      "done",
      "done",
      "done",
      "done",
    ]);
    expect(steps[3].description).toBe(formatDate(LAST_CHANGE_AT));
  });

  it("dates nothing that has not happened", () => {
    const steps = returnSteps(
      source({
        status: "REQUESTED",
        decidedAt: null,
        resolvedAt: null,
        decisionHistory: [],
      }),
    );
    expect(descriptions(steps)).toEqual([
      formatDate(REQUESTED_AT),
      d.stepNow,
      undefined,
      undefined,
    ]);
  });
});
