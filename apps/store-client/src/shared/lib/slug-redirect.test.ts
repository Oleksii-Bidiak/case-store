jest.mock("@/shared/api/generated/slug-redirect/slug-redirect", () => ({
  slugRedirectControllerLookup: jest.fn(),
}));

import { resolveSlugRedirect } from "./slug-redirect";
import { slugRedirectControllerLookup } from "@/shared/api/generated/slug-redirect/slug-redirect";

const lookup = slugRedirectControllerLookup as jest.MockedFunction<
  typeof slugRedirectControllerLookup
>;

afterEach(() => jest.clearAllMocks());

describe("resolveSlugRedirect (TASK-285)", () => {
  it("returns the new slug when the API finds a redirect row", async () => {
    lookup.mockResolvedValue({ data: { newSlug: "nova-adresa" } });

    const result = await resolveSlugRedirect("PAGE", "stara-adresa");

    expect(result).toBe("nova-adresa");
    expect(lookup).toHaveBeenCalledWith({
      entity: "PAGE",
      slug: "stara-adresa",
    });
  });

  it("returns null when the API 404s (no redirect recorded)", async () => {
    lookup.mockRejectedValue(
      Object.assign(new Error("404"), { response: { status: 404 } }),
    );

    await expect(resolveSlugRedirect("PRODUCT", "unknown")).resolves.toBeNull();
  });

  it("returns null on any transport error (degrade, never throw)", async () => {
    lookup.mockRejectedValue(new Error("network down"));

    await expect(
      resolveSlugRedirect("BLOG_POST", "whatever"),
    ).resolves.toBeNull();
  });
});
