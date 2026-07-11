import { GET } from "./route";
import { fetchAllActiveProducts } from "@/shared/lib/schema";
import type { PublicProductEntity } from "@/shared/api/generated/models";

jest.mock("@/shared/lib/schema", () => ({
  fetchAllActiveProducts: jest.fn(),
}));

const mockFetchAllActiveProducts =
  fetchAllActiveProducts as jest.MockedFunction<typeof fetchAllActiveProducts>;

function makeProduct(
  overrides: Partial<PublicProductEntity> = {},
): PublicProductEntity {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "iPhone 15 Pro Case — Clear MagSafe",
    description: "Premium clear case.",
    slug: "iphone-15-pro-case-clear-magsafe",
    price: "29.99",
    inStock: true,
    brand: { name: "Spigen" },
    primaryImage: { url: "https://cdn.example.com/images/product-1.jpg" },
    ...overrides,
  } as PublicProductEntity;
}

function countItems(xml: string): number {
  return (xml.match(/<item>/g) ?? []).length;
}

describe("GET /merchant-feed.xml", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with feed headers and one <item> per active product (happy path)", async () => {
    mockFetchAllActiveProducts.mockResolvedValue([
      makeProduct(),
      makeProduct({
        id: "second-id",
        slug: "second-product",
        brand: null,
        primaryImage: {
          id: "img-2",
          url: "https://cdn.example.com/images/product-2.jpg",
          sortOrder: 0,
          isPrimary: true,
        },
      }),
    ]);

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, s-maxage=86400",
    );
    expect(countItems(body)).toBe(2);
    expect(body).toContain("<g:id>550e8400-e29b-41d4-a716-446655440000</g:id>");
    expect(body).toContain("<g:id>second-id</g:id>");
  });

  it("returns 200 with a valid empty-channel feed when the fetch rejects (never a 500)", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockFetchAllActiveProducts.mockRejectedValue(new Error("API down"));

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(countItems(body)).toBe(0);
    expect(body).toContain("<channel>");
    expect(body).toContain("</rss>");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[merchant-feed] Failed to fetch products:",
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });
});
