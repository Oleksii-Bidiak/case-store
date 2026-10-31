import { dict } from "@/shared/config";
import { bannerWriteErrorMessage } from "./write-error";

function axiosError(status: number, data: unknown) {
  return { response: { status, data } };
}

describe("bannerWriteErrorMessage (TASK-2013)", () => {
  it("words the 409 promo-tile limit in Ukrainian", () => {
    const error = axiosError(409, {
      statusCode: 409,
      error: "BANNER_PROMO_TILE_LIMIT",
      message: "At most 5 promo tiles can be published or scheduled at once",
    });

    expect(bannerWriteErrorMessage(error)).toBe(
      dict.banners.errorPromoTileLimit,
    );
  });

  it("does not trust the code without the 409 status", () => {
    const error = axiosError(500, { error: "BANNER_PROMO_TILE_LIMIT" });

    expect(bannerWriteErrorMessage(error)).toBeUndefined();
  });

  it("leaves any other refusal to the caller's generic toast", () => {
    expect(
      bannerWriteErrorMessage(
        axiosError(409, { error: "REORDER_STALE", message: "stale" }),
      ),
    ).toBeUndefined();
    expect(bannerWriteErrorMessage(new Error("network"))).toBeUndefined();
  });
});
