import * as Sentry from "@sentry/nextjs";
import { GET } from "./route";
import { fetchAllActiveProducts } from "@/shared/lib/schema";
import { categoryControllerGetCategoryTree } from "@/shared/api/generated/categories/categories";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import type {
  CategoryTreeNodeEntity,
  PublicProductEntity,
} from "@/shared/api/generated/models";

jest.mock("@/shared/lib/schema", () => ({
  fetchAllActiveProducts: jest.fn(),
}));

// Category tree behind g:product_type (TASK-432) — mocked per-case below.
jest.mock("@/shared/api/generated/categories/categories", () => ({
  categoryControllerGetCategoryTree: jest.fn(),
}));

// The real SDK is a Next-runtime module; the route only needs the capture entry
// point (a no-op without a DSN anyway).
jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));

// The store name behind the channel <title> and the g:brand fallback (TASK-433).
// null by default — unconfigured, i.e. the SITE_NAME fallback path.
jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn().mockResolvedValue(null),
}));

const mockFetchAllActiveProducts =
  fetchAllActiveProducts as jest.MockedFunction<typeof fetchAllActiveProducts>;
const mockGetCategoryTree =
  categoryControllerGetCategoryTree as jest.MockedFunction<
    typeof categoryControllerGetCategoryTree
  >;
const captureException = Sentry.captureException as jest.Mock;
const mockFetchSeoSettings = fetchSeoSettings as jest.MockedFunction<
  typeof fetchSeoSettings
>;

const CASES_CATEGORY_ID = "cat-cases";

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
    categoryId: CASES_CATEGORY_ID,
    brand: { name: "Spigen" },
    primaryImage: { url: "https://cdn.example.com/images/product-1.jpg" },
    ...overrides,
  } as PublicProductEntity;
}

/** Root «Аксесуари» with a «Чохли» child — the shape the real tree has. */
function makeTree(): CategoryTreeNodeEntity[] {
  return [
    {
      id: "cat-accessories",
      name: "Аксесуари",
      slug: "aksesuary",
      isActive: true,
      sortOrder: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
      children: [
        {
          id: CASES_CATEGORY_ID,
          name: "Чохли",
          slug: "chohly",
          isActive: true,
          sortOrder: 0,
          updatedAt: "2026-01-01T00:00:00.000Z",
          children: [],
        },
      ],
    },
  ];
}

/** The generated client returns `{ data, … }`; only `data` is read here. */
function treeResponse(nodes: CategoryTreeNodeEntity[]) {
  return { data: nodes } as Awaited<
    ReturnType<typeof categoryControllerGetCategoryTree>
  >;
}

function countItems(xml: string): number {
  return (xml.match(/<item>/g) ?? []).length;
}

describe("GET /merchant-feed.xml", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCategoryTree.mockResolvedValue(treeResponse(makeTree()));
    mockFetchSeoSettings.mockResolvedValue(null);
  });

  // TASK-433: the feed's channel <title> and the g:brand of an unbranded product
  // are both the store's name, which the owner now edits in the admin.
  it("takes the channel title and the g:brand fallback from the admin store name", async () => {
    mockFetchSeoSettings.mockResolvedValue({
      siteName: "Аксесуарня",
    } as Awaited<ReturnType<typeof fetchSeoSettings>>);
    mockFetchAllActiveProducts.mockResolvedValue([
      makeProduct({ brand: null }),
    ]);

    const body = await (await GET()).text();

    expect(body).toContain("<title>Аксесуарня</title>");
    expect(body).toContain("<g:brand>Аксесуарня</g:brand>");
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
    // The 200 is deliberate (a 5xx can get the feed suspended), so nothing else
    // signals the failure — console.* does not reach Sentry from the Node runtime.
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { route: "merchant-feed" } }),
    );

    consoleErrorSpy.mockRestore();
  });

  it("reports nothing to Sentry on the happy path", async () => {
    mockFetchAllActiveProducts.mockResolvedValue([makeProduct()]);

    await GET();

    expect(captureException).not.toHaveBeenCalled();
  });

  // --- g:product_type from the category tree (TASK-432) --------------------

  it("resolves g:product_type from the category tree by the product's categoryId", async () => {
    mockFetchAllActiveProducts.mockResolvedValue([makeProduct()]);

    const body = await (await GET()).text();

    expect(body).toContain(
      "<g:product_type>Аксесуари &gt; Чохли</g:product_type>",
    );
  });

  it("omits g:product_type for a product whose category is not in the tree", async () => {
    mockFetchAllActiveProducts.mockResolvedValue([
      makeProduct({ categoryId: "cat-deleted" }),
    ]);

    const body = await (await GET()).text();

    expect(countItems(body)).toBe(1);
    expect(body).not.toContain("<g:product_type>");
  });

  it("still ships the full catalogue when the category tree fetch fails", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockFetchAllActiveProducts.mockResolvedValue([makeProduct()]);
    mockGetCategoryTree.mockRejectedValue(new Error("tree down"));

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(countItems(body)).toBe(1);
    expect(body).not.toContain("<g:product_type>");
    // The degradation is reported — an optional attribute silently vanishing
    // from the whole feed is exactly the kind of thing nobody notices.
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { route: "merchant-feed", part: "category-tree" },
      }),
    );

    consoleErrorSpy.mockRestore();
  });
});
