import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { EditProductView } from "./edit-product-view";

// next/navigation is unavailable under jsdom — mock the router.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const PRODUCT_ID = "product-uuid-1";

function makeProduct(isActive: boolean) {
  return {
    id: PRODUCT_ID,
    name: "Чохол MagSafe",
    slug: "chohol-magsafe",
    description: null,
    price: "29.99",
    compareAtPrice: null,
    sku: null,
    stock: 10,
    reservedQty: 0,
    physicalQty: 10,
    categoryId: "3f0e8f9a-1111-4222-8333-444455556666",
    groupId: null,
    brand: null,
    attributes: {},
    positionOrder: 0,
    isActive,
    metaTitle: null,
    metaDescription: null,
    specs: [],
    compatibleDeviceModels: [],
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-01T09:00:00.000Z",
  };
}

function stubProduct(product: ReturnType<typeof makeProduct>) {
  const putCalls: unknown[] = [];
  server.use(
    // Form option queries. The category picker must contain the product's own
    // category or the select resets and zod fails with "Оберіть категорію".
    http.get("*/api/categories/admin/tree", () =>
      HttpResponse.json({
        data: [
          {
            id: "3f0e8f9a-1111-4222-8333-444455556666",
            name: "Чохли",
            slug: "chohly",
            description: null,
            image: null,
            isActive: true,
            sortOrder: 0,
            children: [],
          },
        ],
      }),
    ),
    http.get("*/api/product-groups", () => HttpResponse.json({ data: [] })),
    http.get("*/api/brands/admin/list", () =>
      HttpResponse.json({
        data: [],
        meta: { total: 0, page: 1, limit: 100, totalPages: 0 },
      }),
    ),
    // Specs editor (TASK-191) — effective templates for the category.
    http.get(
      "*/api/categories/3f0e8f9a-1111-4222-8333-444455556666/effective-attribute-definitions",
      () => HttpResponse.json({ data: [] }),
    ),
    // Image manager + device-compat pickers mounted below the form.
    http.get(`*/api/products/${PRODUCT_ID}/images`, () =>
      HttpResponse.json({ data: [] }),
    ),
    http.get("*/api/device-brands", () => HttpResponse.json({ data: [] })),
    http.get("*/api/device-models", () => HttpResponse.json({ data: [] })),
    http.get(`*/api/products/admin/${PRODUCT_ID}`, () =>
      HttpResponse.json({ data: product }),
    ),
    http.put(`*/api/products/${PRODUCT_ID}`, async ({ request }) => {
      putCalls.push(await request.json());
      return HttpResponse.json({ data: product });
    }),
  );
  return putCalls;
}

async function renderAndWaitForForm(product: ReturnType<typeof makeProduct>) {
  const putCalls = stubProduct(product);
  renderWithProviders(<EditProductView productId={PRODUCT_ID} />);
  await waitFor(() =>
    expect(screen.getByLabelText(dict.productForm.slug)).toHaveValue(
      product.slug,
    ),
  );
  return putCalls;
}

const submit = () =>
  userEvent.click(
    screen.getByRole("button", { name: dict.common.saveChanges }),
  );

describe("EditProductView — slug-rename guard (TASK-285)", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it("submits without any confirm when the slug is unchanged on an active product", async () => {
    const putCalls = await renderAndWaitForForm(makeProduct(true));

    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("blocks the update when the admin cancels the active-slug-change confirm", async () => {
    confirmSpy.mockReturnValue(false);
    const putCalls = await renderAndWaitForForm(makeProduct(true));

    const slugField = screen.getByLabelText(dict.productForm.slug);
    await userEvent.clear(slugField);
    await userEvent.type(slugField, "nova-adresa");
    await submit();

    expect(confirmSpy).toHaveBeenCalledWith(
      dict.products.slugChangeConfirm("chohol-magsafe", "nova-adresa"),
    );
    expect(putCalls).toHaveLength(0);
  });

  it("fires the update after the admin accepts the confirm", async () => {
    const putCalls = await renderAndWaitForForm(makeProduct(true));

    const slugField = screen.getByLabelText(dict.productForm.slug);
    await userEvent.clear(slugField);
    await userEvent.type(slugField, "nova-adresa");
    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it("never confirms a slug change on an INACTIVE product", async () => {
    const putCalls = await renderAndWaitForForm(makeProduct(false));

    const slugField = screen.getByLabelText(dict.productForm.slug);
    await userEvent.clear(slugField);
    await userEvent.type(slugField, "nova-adresa");
    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

/**
 * TASK-397. Every grouped product answered 400 on save, and the toast said only
 * "Не вдалося оновити товар" — the operator had no way to learn that the seeded
 * `groupId` was the rejected field. Diagnosing it cost a live demo run.
 */
describe("EditProductView — update failure toast (TASK-397)", () => {
  beforeEach(() => {
    toastError.mockClear();
    toastSuccess.mockClear();
  });

  it("shows the ValidationPipe message from a 400 rather than the generic copy", async () => {
    await renderAndWaitForForm(makeProduct(true));
    // Registered after the default stub — MSW gives the newest handler priority.
    server.use(
      http.put(`*/api/products/${PRODUCT_ID}`, () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: ["Group ID must be a valid UUID"],
            error: "Bad Request",
          },
          { status: 400 },
        ),
      ),
    );

    await submit();

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith("Group ID must be a valid UUID");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("falls back to the dictionary copy when the response carries no message", async () => {
    await renderAndWaitForForm(makeProduct(true));
    server.use(
      http.put(`*/api/products/${PRODUCT_ID}`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );

    await submit();

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith(dict.products.toastUpdateFailed);
  });
});
