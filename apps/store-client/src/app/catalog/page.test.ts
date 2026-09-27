// Next's permanentRedirect() throws a special signal; a throwing jest.fn()
// stands in for it so each test can read where it was sent (same idiom as the
// compat landing's page.test.ts).
jest.mock("next/navigation", () => ({
  permanentRedirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import CatalogIndexPage from "./page";

type Params = { [key: string]: string | string[] | undefined };

async function redirectOf(params: Params): Promise<string> {
  try {
    await CatalogIndexPage({ searchParams: Promise.resolve(params) });
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("NEXT_REDIRECT:")) {
      return message.slice("NEXT_REDIRECT:".length);
    }
    throw error;
  }
  throw new Error("the page rendered instead of redirecting");
}

/**
 * TASK-836 (SF-UX-13): banner CTAs written by the first seed pointed at a bare
 * `/catalog`, which the storefront never served, and every prefetch of them
 * logged a 404. The route now exists only to send such a link where it meant
 * to go.
 */
describe("/catalog (bare) — legacy banner links (TASK-836)", () => {
  it("sends a bare /catalog to the catalogue", async () => {
    await expect(redirectOf({})).resolves.toBe("/products");
  });

  it("sends the old «sale» CTA to the deals landing", async () => {
    await expect(redirectOf({ sale: "true" })).resolves.toBe("/promo");
    await expect(redirectOf({ sale: ["true", "false"] })).resolves.toBe(
      "/promo",
    );
  });

  it("carries any other query over to /products", async () => {
    await expect(redirectOf({ category: "cases", page: "2" })).resolves.toBe(
      "/products?category=cases&page=2",
    );
  });

  it("does not treat sale=false as the deals link", async () => {
    await expect(redirectOf({ sale: "false" })).resolves.toBe(
      "/products?sale=false",
    );
  });

  it("keeps repeated params and drops absent ones", async () => {
    await expect(
      redirectOf({ brand: ["apple", "samsung"], search: undefined }),
    ).resolves.toBe("/products?brand=apple&brand=samsung");
  });
});
