// The route imports the widgets barrel (ProductDetailView — heavy client
// tree); the redirect tests never render it, so stub the barrel.
jest.mock("@/widgets", () => ({
  ProductDetailView: () => null,
  ProductDetailSkeleton: () => null,
}));
// Product fetch used by buildProductPageSchemas — rejects to simulate a 404.
// The rails' listing prefetch (TASK-563) is stubbed with the generated key
// shape, so its fetch is an assertable mock rather than axios.
jest.mock("@/shared/api/generated/products/products", () => {
  const findAll = jest.fn().mockResolvedValue({ data: [], meta: {} });
  return {
    productControllerFindBySlug: jest.fn(),
    productControllerFindAll: findAll,
    getProductControllerFindBySlugQueryKey: (slug: string) => [
      `/api/products/${slug}`,
    ],
    getProductControllerFindAllQueryOptions: (params: unknown) => ({
      queryKey: ["/api/products", params],
      queryFn: () => findAll(params),
    }),
  };
});
// A populated global FAQ — the PDP must emit none of it (TASK-555).
jest.mock("@/shared/api/faq-server", () => ({
  fetchFaqItems: jest
    .fn()
    .mockResolvedValue([
      { question: "Скільки коштує доставка?", answer: "[вартість]" },
    ]),
}));
jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn().mockResolvedValue(null),
}));
// Next's permanentRedirect() throws a special signal; mock it with a throwing
// jest.fn() so the tests can assert the redirect fired.
jest.mock("next/navigation", () => ({
  permanentRedirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  // notFound() throws Next's not-found signal the same way (TASK-874).
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
// Slug-redirect lookup (TASK-285) — mocked per-case below.
jest.mock("@/shared/lib/slug-redirect", () => ({
  resolveSlugRedirect: jest.fn(),
}));
// React `cache()` memoizes only inside a server request, which Jest never opens —
// outside one it is a pass-through. Stand in for the request scope, emptied
// between tests (same stand-in as products/page.test.ts, TASK-703).
jest.mock("react", () => {
  const actual = jest.requireActual("react");
  const scope = globalThis as { __requestMemos?: Map<string, unknown>[] };
  scope.__requestMemos ??= [];
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const memo = new Map<string, R>();
      scope.__requestMemos!.push(memo as Map<string, unknown>);
      return (...args: A): R => {
        const key = JSON.stringify(args);
        if (!memo.has(key)) memo.set(key, fn(...args));
        return memo.get(key)!;
      };
    },
  };
});

import ProductDetailPage, { generateMetadata } from "./page";
import { notFound, permanentRedirect } from "next/navigation";
import {
  productControllerFindAll,
  productControllerFindBySlug,
} from "@/shared/api/generated/products/products";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";
import { fetchFaqItems } from "@/shared/api/faq-server";
import { findDehydratedQueryKeys } from "@/shared/test/element-tree";
import { buildProductRailParams } from "@/widgets/product-detail/model/rail-params";

const findBySlug = productControllerFindBySlug as jest.MockedFunction<
  typeof productControllerFindBySlug
>;
const findAll = productControllerFindAll as jest.MockedFunction<
  typeof productControllerFindAll
>;
const resolveRedirect = resolveSlugRedirect as jest.MockedFunction<
  typeof resolveSlugRedirect
>;

afterEach(() => {
  jest.clearAllMocks();
  (
    globalThis as { __requestMemos?: Map<string, unknown>[] }
  ).__requestMemos?.forEach((memo) => memo.clear());
});

describe("products/[slug] slug-redirect (TASK-285)", () => {
  const runPage = (slug: string) =>
    ProductDetailPage({ params: Promise.resolve({ slug }) });

  it("permanently redirects a renamed slug to its current address", async () => {
    findBySlug.mockRejectedValue(
      Object.assign(new Error("404"), { response: { status: 404 } }),
    );
    resolveRedirect.mockResolvedValue("novyi-slug");

    await expect(runPage("staryi-slug")).rejects.toThrow(
      "NEXT_REDIRECT:/products/novyi-slug",
    );

    expect(resolveRedirect).toHaveBeenCalledWith("PRODUCT", "staryi-slug");
    expect(permanentRedirect).toHaveBeenCalledWith("/products/novyi-slug");
    expect(notFound).not.toHaveBeenCalled();
  });

  // TASK-874 — a dead slug used to render the page anyway and leave the
  // «не вдалося завантажити» block to the client: a soft 404.
  it("serves the route's notFound() for a dead slug with no redirect row", async () => {
    findBySlug.mockRejectedValue(
      Object.assign(new Error("404"), { response: { status: 404 } }),
    );
    resolveRedirect.mockResolvedValue(null);

    await expect(runPage("never-existed")).rejects.toThrow("NEXT_NOT_FOUND");

    // The ledger is still consulted first — a rename must win over a 404.
    expect(resolveRedirect).toHaveBeenCalledWith("PRODUCT", "never-existed");
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("does not call an outage a missing product — a 502 or a timeout renders the page", async () => {
    resolveRedirect.mockResolvedValue(null);

    for (const failure of [
      Object.assign(new Error("502"), { response: { status: 502 } }),
      new Error("timeout of 8000ms exceeded"),
    ]) {
      findBySlug.mockRejectedValueOnce(failure);
      await expect(runPage(`outage-${failure.message}`)).resolves.toBeDefined();
    }

    // ProductDetailView retries on the client and shows its load error.
    expect(notFound).not.toHaveBeenCalled();
  });

  it("never consults the redirect ledger when the product resolves", async () => {
    findBySlug.mockResolvedValue({
      data: {
        id: "product-1",
        name: "Чохол",
        slug: "chohol",
        description: null,
        price: "29.99",
        metaTitle: null,
        metaDescription: null,
      },
      images: [],
      category: { id: "cat-1", name: "Чохли" },
    } as never);

    await expect(runPage("chohol")).resolves.toBeDefined();

    expect(resolveRedirect).not.toHaveBeenCalled();
    expect(permanentRedirect).not.toHaveBeenCalled();
  });
});

/** Every `schema` prop of a JsonLd element anywhere in a rendered tree. */
function jsonLdSchemas(node: unknown): Record<string, unknown>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(jsonLdSchemas);
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props) return [];
  const own =
    props.schema && typeof props.schema === "object"
      ? [props.schema as Record<string, unknown>]
      : [];
  return [...own, ...jsonLdSchemas(props.children)];
}

describe("products/[slug] structured data (TASK-555)", () => {
  it("emits Product and BreadcrumbList but no FAQPage — the FAQ is not on this page", async () => {
    findBySlug.mockResolvedValue({
      data: {
        id: "product-1",
        name: "Чохол",
        slug: "chohol",
        description: null,
        price: "29.99",
        inStock: true,
        ratingCount: 0,
        ratingAverage: null,
        metaTitle: null,
        metaDescription: null,
      },
      images: [],
      category: { id: "cat-1", name: "Чохли", slug: "chohly" },
    } as never);

    const tree = await ProductDetailPage({
      params: Promise.resolve({ slug: "chohol" }),
    });

    const types = jsonLdSchemas(tree).map((schema) => schema["@type"]);
    expect(types).toEqual(["Product", "BreadcrumbList"]);
    expect(fetchFaqItems).not.toHaveBeenCalled();
  });
});

// TASK-550 — the site-wide `noindexSite` robots live on the root layout, and
// Next merges metadata shallowly: a product page that returned its own `robots`
// would replace them. The PDP (the bulk of indexable URLs) must therefore carry
// no `robots` key on either branch, so it always inherits the root's.
describe("products/[slug] generateMetadata robots inheritance (TASK-550)", () => {
  const runMetadata = (slug: string) =>
    generateMetadata({ params: Promise.resolve({ slug }) });

  it("emits no robots key for a resolved product", async () => {
    findBySlug.mockResolvedValue({
      data: {
        id: "product-1",
        name: "Чохол",
        slug: "chohol",
        description: null,
        price: "29.99",
        metaTitle: null,
        metaDescription: null,
      },
      images: [],
      category: { id: "cat-1", name: "Чохли" },
    } as never);

    const meta = await runMetadata("chohol");

    expect(meta.title).toBeDefined();
    expect(meta).not.toHaveProperty("robots");
  });

  it("emits no robots key on the fetch-failure fallback", async () => {
    findBySlug.mockRejectedValue(new Error("API down"));

    const meta = await runMetadata("chohol");

    expect(meta).not.toHaveProperty("robots");
  });
});

describe("products/[slug] — the first HTML carries the product (TASK-563)", () => {
  const detail = {
    data: {
      id: "product-1",
      name: "Чохол",
      slug: "chohol",
      description: null,
      price: "29.99",
      inStock: true,
      ratingCount: 0,
      ratingAverage: null,
      metaTitle: null,
      metaDescription: null,
      compatibleDeviceModels: [{ id: "dm-15", name: "iPhone 15" }],
    },
    images: [],
    category: { id: "cat-1", name: "Чохли", slug: "chohly" },
  };
  const runPage = () =>
    ProductDetailPage({ params: Promise.resolve({ slug: "chohol" }) });

  it("hands the fetched product and both rails to the client", async () => {
    findBySlug.mockResolvedValue(detail as never);

    const tree = await runPage();

    expect(findDehydratedQueryKeys(tree)).toEqual([
      ["/api/products/chohol"],
      ["/api/products", buildProductRailParams({ categoryId: "cat-1" })],
      ["/api/products", buildProductRailParams({ deviceModelId: "dm-15" })],
    ]);
  });

  it("reads the product once for metadata, JSON-LD and the prefetch", async () => {
    findBySlug.mockResolvedValue(detail as never);

    await generateMetadata({ params: Promise.resolve({ slug: "chohol" }) });
    await runPage();

    // One request scope (the `cache()` stand-in above): three consumers, one
    // axios read — it would be three without the shared `fetchProductBySlug`.
    expect(findBySlug).toHaveBeenCalledTimes(1);
  });

  it("seeds nothing for a product that did not load", async () => {
    findBySlug.mockRejectedValue(new Error("API down"));
    resolveRedirect.mockResolvedValue(null);

    const tree = await runPage();

    expect(findDehydratedQueryKeys(tree)).toEqual([]);
    expect(findAll).not.toHaveBeenCalled();
  });
});
