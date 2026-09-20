import { contactSubmitErrorKind } from "./submit-error";

const axiosError = (status: number, data?: unknown) => ({
  response: { status, data },
});

describe("contactSubmitErrorKind (TASK-452)", () => {
  it("recognises the per-email cooldown by its code", () => {
    expect(
      contactSubmitErrorKind(
        axiosError(429, { statusCode: 429, error: "CONTACT_COOLDOWN" }),
      ),
    ).toBe("cooldown");
  });

  it("treats any other 429 as the per-IP rate limit", () => {
    expect(
      contactSubmitErrorKind(
        axiosError(429, { statusCode: 429, error: "ThrottlerException" }),
      ),
    ).toBe("rateLimited");
    expect(contactSubmitErrorKind(axiosError(429))).toBe("rateLimited");
  });

  it("falls back to a generic failure for everything else", () => {
    expect(contactSubmitErrorKind(axiosError(500))).toBe("failed");
    expect(contactSubmitErrorKind(new Error("Network Error"))).toBe("failed");
    expect(contactSubmitErrorKind(null)).toBe("failed");
  });
});
