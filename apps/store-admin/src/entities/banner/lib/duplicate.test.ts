import type { BannerEntity } from "@/shared/api";
import { duplicateBannerPayload } from "./duplicate";

const banner = {
  id: "b1",
  placement: "HERO_SLIDE",
  title: "Аксесуари",
  subtitle: null,
  imageUrl: null,
  ctaLabel: null,
  ctaHref: null,
  theme: null,
  status: "PUBLISHED",
} as unknown as BannerEntity;

describe("duplicateBannerPayload", () => {
  it("keeps a long title within the API's 255 characters", () => {
    const payload = duplicateBannerPayload({
      ...banner,
      title: "Я".repeat(250),
    });
    expect(payload.title.length).toBeLessThanOrEqual(255);
    expect(payload.title.endsWith("(копія)")).toBe(true);
  });

  it("leaves a short title whole", () => {
    expect(duplicateBannerPayload(banner).title).toBe("Аксесуари (копія)");
  });
});
