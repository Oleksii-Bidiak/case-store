import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "./api-error";

/**
 * TASK-574: a Prisma failure the API used to answer with a bare 500 now arrives
 * as a 409/404/400 envelope with a stable code and a Ukrainian sentence. These
 * readers must surface both, so a caller shows the sentence instead of its
 * generic fallback.
 */
function axiosError(status: number, data: unknown) {
  return { response: { status, data } };
}

describe("api-error readers — translated Prisma failures (TASK-574)", () => {
  const conflict = axiosError(409, {
    statusCode: 409,
    error: "UNIQUE_CONSTRAINT_VIOLATION",
    message:
      "Такий запис уже існує або його щойно змінили паралельно. Оновіть сторінку й спробуйте ще раз.",
  });

  it("reads the 409 status, code and human message", () => {
    expect(apiErrorStatus(conflict)).toBe(409);
    expect(apiErrorCode(conflict)).toBe("UNIQUE_CONSTRAINT_VIOLATION");
    expect(apiErrorMessage(conflict)).toMatch(/Такий запис уже існує/);
  });

  it("reads a 404 for a record that vanished", () => {
    const gone = axiosError(404, {
      statusCode: 404,
      error: "RECORD_NOT_FOUND",
      message: "Запис не знайдено — можливо, його щойно видалили.",
    });

    expect(apiErrorStatus(gone)).toBe(404);
    expect(apiErrorMessage(gone)).toBe(
      "Запис не знайдено — можливо, його щойно видалили.",
    );
  });

  it("returns undefined for a body with no message, so the caller's fallback applies", () => {
    expect(apiErrorMessage(axiosError(500, {}))).toBeUndefined();
  });
});
