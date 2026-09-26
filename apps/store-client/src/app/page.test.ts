// The home page imports the widgets barrel (heavy client trees) and three
// server fetchers; only `generateMetadata` is under test here.
jest.mock("@/widgets", () => ({}));
jest.mock("@/shared/api/banners-server", () => ({
  fetchPublishedBanners: jest.fn(),
}));
jest.mock("@/shared/api/carousels-server", () => ({
  fetchPublishedCarouselsByPlacement: jest.fn(),
}));
jest.mock("@/shared/api/site-contact-server", () => ({
  fetchSiteContactSettings: jest.fn(),
}));
jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn().mockResolvedValue(null),
}));

import { SITE_URL } from "@/shared/config";
import { generateMetadata } from "./page";

describe("home page metadata (TASK-549)", () => {
  it("declares itself canonical, so ?utm_… variants consolidate onto /", async () => {
    const meta = await generateMetadata();

    expect(meta.alternates?.canonical).toBe(SITE_URL);
    expect(meta.openGraph?.url).toBe(SITE_URL);
  });
});
