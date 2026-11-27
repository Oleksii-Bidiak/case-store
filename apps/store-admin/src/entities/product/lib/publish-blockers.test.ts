import { dict } from "@/shared/config";
import {
  productNotReadyMessage,
  productNotShownMessage,
  publishBlockerReasons,
  skippedProductsMessage,
} from "./publish-blockers";

const reasons = dict.productPublish.blockerReasons;

describe("publish blockers wording (TASK-2573)", () => {
  it("joins the reasons in the server's order", () => {
    expect(publishBlockerReasons(["name", "photo"])).toBe(
      `${reasons.name}, ${reasons.photo}`,
    );
  });

  it("says why one product was not shown", () => {
    expect(productNotShownMessage(["price"])).toBe(
      `Товар не показано: ${reasons.price}`,
    );
  });

  it("reads a 400 PRODUCT_NOT_READY refusal, and only that", () => {
    const failure = (status: number, error: string, blockers?: unknown) => ({
      response: { status, data: { statusCode: status, error, blockers } },
    });
    expect(
      productNotReadyMessage(failure(400, "PRODUCT_NOT_READY", ["photo"])),
    ).toBe(`Товар не показано: ${reasons.photo}`);
    expect(
      productNotReadyMessage(failure(400, "Bad Request", ["photo"])),
    ).toBeUndefined();
    expect(
      productNotReadyMessage(failure(500, "PRODUCT_NOT_READY", ["photo"])),
    ).toBeUndefined();
    expect(
      productNotReadyMessage(failure(400, "PRODUCT_NOT_READY")),
    ).toBeUndefined();
  });

  it("names up to three skipped products and counts the rest", () => {
    const skipped = ["А", "Б", "В", "Г", "Ґ"].map((name, i) => ({
      id: `p-${i}`,
      name,
      blockers: ["photo" as const],
    }));
    const message = skippedProductsMessage(skipped);
    expect(message).toContain(`«А» — ${reasons.photo}`);
    expect(message).toContain(`«В» — ${reasons.photo}`);
    expect(message).not.toContain("«Г»");
    expect(message).toMatch(/і ще 2$/);
  });

  it("adds no «і ще» when every skipped product is named", () => {
    const message = skippedProductsMessage([
      { id: "p-1", name: "А", blockers: ["category"] },
    ]);
    expect(message).toContain(`«А» — ${reasons.category}`);
    expect(message).not.toContain("і ще");
  });
});
