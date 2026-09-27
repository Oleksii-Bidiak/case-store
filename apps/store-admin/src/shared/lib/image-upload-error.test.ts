import { AxiosError, AxiosHeaders } from "axios";
import { imageUploadErrorMessage } from "./image-upload-error";

const COPY = {
  errorTooLarge: "too large",
  errorUnsupportedType: "unsupported",
  errorGeneric: "generic",
};

/** A real AxiosError, as the Orval mutation rejects with. */
function axiosRejection(status: number): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("failed", "ERR_BAD_REQUEST", config, undefined, {
    status,
    statusText: "",
    headers: {},
    config,
    data: { statusCode: status, error: "Anything", message: "server prose" },
  });
}

describe("imageUploadErrorMessage (TASK-441, TASK-810)", () => {
  it("maps the shared upload status contract", () => {
    expect(imageUploadErrorMessage(axiosRejection(413), COPY)).toBe(
      "too large",
    );
    expect(imageUploadErrorMessage(axiosRejection(415), COPY)).toBe(
      "unsupported",
    );
    // Without `errorRejected`, a 400 reads exactly as a 415 — as before.
    expect(imageUploadErrorMessage(axiosRejection(400), COPY)).toBe(
      "unsupported",
    );
    expect(imageUploadErrorMessage(axiosRejection(500), COPY)).toBe("generic");
  });

  it("gives a 400 its own sentence when the caller supplies errorRejected", () => {
    const copy = { ...COPY, errorRejected: "rejected" };

    expect(imageUploadErrorMessage(axiosRejection(400), copy)).toBe("rejected");
    // …and only a 400: the 415 still means «wrong type».
    expect(imageUploadErrorMessage(axiosRejection(415), copy)).toBe(
      "unsupported",
    );
  });

  it("falls back to the generic copy for a failure with no response", () => {
    expect(imageUploadErrorMessage(new Error("network"), COPY)).toBe("generic");
    expect(imageUploadErrorMessage(undefined, COPY)).toBe("generic");
  });
});
