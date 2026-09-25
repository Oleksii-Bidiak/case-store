import { apiErrorMessage, apiErrorStatus } from "./api-error-message";

/**
 * TASK-574: two simultaneous ownership transfers used to answer HTTP 500 — the
 * toast said only «Не вдалося…». The API now answers 409 with a Ukrainian
 * sentence, and every admin call site renders `apiErrorMessage(error) ?? d.…`,
 * so the operator reads what actually happened.
 */
function axiosError(status: number, data: unknown) {
  return { response: { status, data } };
}

describe("apiErrorMessage — translated Prisma failures (TASK-574)", () => {
  it("surfaces the 409 sentence for a unique clash", () => {
    const error = axiosError(409, {
      statusCode: 409,
      error: "UNIQUE_CONSTRAINT_VIOLATION",
      message:
        "Такий запис уже існує або його щойно змінили паралельно. Оновіть сторінку й спробуйте ще раз.",
    });

    expect(apiErrorStatus(error)).toBe(409);
    expect(apiErrorMessage(error)).toMatch(/щойно змінили паралельно/);
  });

  it("surfaces the 404 sentence for a vanished record", () => {
    const error = axiosError(404, {
      statusCode: 404,
      error: "RECORD_NOT_FOUND",
      message: "Запис не знайдено — можливо, його щойно видалили.",
    });

    expect(apiErrorMessage(error)).toBe(
      "Запис не знайдено — можливо, його щойно видалили.",
    );
  });

  it("returns undefined without a message, so the caller's own copy is shown", () => {
    expect(apiErrorMessage(axiosError(500, {}))).toBeUndefined();
  });
});
