import { refusalMessage } from "./refusal-message";

const failed = (status: number | undefined, message: unknown) => ({
  response: status === undefined ? undefined : { status, data: { message } },
});

describe("refusalMessage (TASK-1984)", () => {
  it("gives the words of a 4xx refusal", () => {
    expect(refusalMessage(failed(400, "Не так"))).toBe("Не так");
    expect(refusalMessage(failed(409, ["a", "b"]))).toBe("a b");
  });

  it("gives nothing for a 5xx or a lost answer", () => {
    expect(
      refusalMessage(failed(500, "Internal server error")),
    ).toBeUndefined();
    expect(refusalMessage(failed(undefined, "x"))).toBeUndefined();
    expect(refusalMessage(new Error("network"))).toBeUndefined();
  });
});
