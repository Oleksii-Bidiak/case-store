import {
  apiErrorCode,
  apiErrorMessage,
  apiErrorRetryAfterSeconds,
  apiErrorStatus,
  isNetworkError,
} from "./api-error";

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

describe("apiErrorRetryAfterSeconds (TASK-762)", () => {
  const withHeaders = (headers: unknown, data: unknown = {}) => ({
    response: { status: 429, data, headers },
  });

  it("reads retryAfterSeconds from the body first", () => {
    expect(
      apiErrorRetryAfterSeconds(
        withHeaders({ "retry-after": "5" }, { retryAfterSeconds: 42 }),
      ),
    ).toBe(42);
  });

  it("falls back to the Retry-After header (plain object or AxiosHeaders-like)", () => {
    expect(
      apiErrorRetryAfterSeconds(withHeaders({ "retry-after": "30" })),
    ).toBe(30);
    expect(
      apiErrorRetryAfterSeconds(
        withHeaders({
          get: (name: string) => (name === "retry-after" ? "7" : null),
        }),
      ),
    ).toBe(7);
  });

  it("ignores what is not a positive number of seconds", () => {
    expect(apiErrorRetryAfterSeconds(withHeaders({}))).toBeUndefined();
    expect(
      apiErrorRetryAfterSeconds(
        withHeaders({ "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }),
      ),
    ).toBeUndefined();
    expect(
      apiErrorRetryAfterSeconds(withHeaders({}, { retryAfterSeconds: -1 })),
    ).toBeUndefined();
    expect(
      apiErrorRetryAfterSeconds(new Error("Network Error")),
    ).toBeUndefined();
  });
});

/**
 * TASK-1964: a request that never got an answer is not a refusal. The return
 * form keeps what the customer typed and sends it once the connection is back,
 * which is only safe when no answer of any kind came back.
 */
describe("isNetworkError (TASK-1964)", () => {
  it("is true for axios's no-response failure", () => {
    expect(
      isNetworkError({ code: "ERR_NETWORK", message: "Network Error" }),
    ).toBe(true);
    expect(isNetworkError(new Error("Network Error"))).toBe(true);
  });

  it("is false whenever the server answered, whatever the status", () => {
    expect(
      isNetworkError({
        code: "ERR_NETWORK",
        response: { status: 500, data: {} },
      }),
    ).toBe(false);
    expect(isNetworkError(axiosError(429, {}))).toBe(false);
  });

  it("is false for a timeout, a cancel, or something that is not an error", () => {
    expect(isNetworkError({ code: "ECONNABORTED", message: "timeout" })).toBe(
      false,
    );
    expect(isNetworkError(undefined)).toBe(false);
    expect(isNetworkError("Network Error")).toBe(false);
  });
});
