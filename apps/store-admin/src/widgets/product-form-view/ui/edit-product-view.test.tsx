import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { formatDate } from "@/shared/lib";
import { EditProductView } from "./edit-product-view";

// next/navigation is unavailable under jsdom — mock the router. Stable
// references (TASK-427): "saving keeps you on the page" is an assertion about
// what the router was NOT asked to do.
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
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
    sku: null as string | null,
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
  // TASK-427: the header's delete action calls `useAuth()`, which throws outside
  // a provider. Owner — the session that sees every control.
  renderWithProviders(
    <WithAuth isOwner>
      <EditProductView productId={PRODUCT_ID} />
    </WithAuth>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText(dict.productForm.slug)).toHaveValue(
      product.slug,
    ),
  );
  return putCalls;
}

const submit = () =>
  userEvent.click(screen.getByRole("button", { name: dict.common.save }));

describe("EditProductView — changing the address of a live product (TASK-285, Ф4)", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, "confirm");
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it("submits without any prompt when the slug is unchanged on an active product", async () => {
    const putCalls = await renderAndWaitForForm(makeProduct(true));

    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("locks the slug of a live product behind «Змінити…»", async () => {
    await renderAndWaitForForm(makeProduct(true));

    expect(screen.getByLabelText(dict.productForm.slug)).toHaveAttribute(
      "readonly",
    );
    expect(
      screen.getByText(dict.productForm.slugLockedHint),
    ).toBeInTheDocument();
  });

  async function openSlugDialog(next: string) {
    await userEvent.click(
      screen.getByRole("button", { name: dict.productForm.slugChange }),
    );
    const dialog = await screen.findByRole("alertdialog");
    const input = within(dialog).getByLabelText(
      dict.productForm.slugDialogLabel,
    );
    await userEvent.clear(input);
    await userEvent.type(input, next);
    return dialog;
  }

  it("cancel in «Змінити адресу товару?» changes nothing", async () => {
    const putCalls = await renderAndWaitForForm(makeProduct(true));

    const dialog = await openSlugDialog("nova-adresa");
    expect(dialog).toHaveTextContent(
      dict.productForm.slugDialogDescription("chohol-magsafe"),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );

    expect(screen.getByLabelText(dict.productForm.slug)).toHaveValue(
      "chohol-magsafe",
    );
    await submit();
    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(putCalls[0]).toEqual(
      expect.objectContaining({ slug: "chohol-magsafe" }),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("«Змінити адресу» stages the new slug, and «Зберегти» sends it — no window.confirm", async () => {
    const putCalls = await renderAndWaitForForm(makeProduct(true));

    const dialog = await openSlugDialog("nova-adresa");
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: dict.productForm.slugDialogConfirm,
      }),
    );

    expect(screen.getByLabelText(dict.productForm.slug)).toHaveValue(
      "nova-adresa",
    );
    expect(
      await screen.findByText(
        dict.canon.unsavedChanges(dict.productForm.sectionMain),
      ),
    ).toBeInTheDocument();
    await submit();
    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(putCalls[0]).toEqual(
      expect.objectContaining({ slug: "nova-adresa" }),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("an INACTIVE product's slug is a plain field", async () => {
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

/**
 * TASK-427. Saving used to `router.push("/products")`, so three edits to one
 * product cost three trips back through the list — and threw away the page's
 * other panels (images, specs, add-ons, compatibility), which save separately.
 *
 * Removing a redirect is only safe if the form then shows what the server holds,
 * which is what `docs/conventions/forms.md` Rule 2 is about; the second case
 * below is that guarantee, not a restatement of the first.
 */
describe("EditProductView — staying on the page after a save (TASK-427)", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it("confirms with a toast and navigates nowhere", async () => {
    const putCalls = await renderAndWaitForForm(makeProduct(true));

    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(dict.products.toastUpdated),
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    // Still the edit form, with its other panels intact.
    expect(screen.getByLabelText(dict.productForm.slug)).toBeInTheDocument();
  });

  it("re-seeds untouched fields from the refetch rather than from the mount", async () => {
    const product = makeProduct(true);
    await renderAndWaitForForm(product);

    let saved = false;
    // Registered after the defaults — MSW gives the newest handler priority.
    server.use(
      // The server's answer changes after the write — the case a redirect used
      // to hide and a stale form would now show forever.
      http.get(`*/api/products/admin/${PRODUCT_ID}`, () =>
        HttpResponse.json({
          data: saved ? { ...product, stock: 42 } : product,
        }),
      ),
      http.put(`*/api/products/${PRODUCT_ID}`, () => {
        saved = true;
        return HttpResponse.json({ data: product });
      }),
    );

    await submit();

    await waitFor(() => expect(saved).toBe(true));
    // `values` + keepDirtyValues: the operator touched neither field, so both
    // take the server's answer. A number, because the input is type="number".
    await waitFor(() =>
      expect(screen.getByLabelText(dict.productForm.stock)).toHaveValue(42),
    );
  });
});

/**
 * TASK-427 — deleting from the edit page. Unlike the list row, this one has to
 * leave: the URL it is on resolves to nothing once the product is tombstoned.
 */
describe("EditProductView — delete (TASK-427)", () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it("returns to the list after the server confirms the delete", async () => {
    await renderAndWaitForForm(makeProduct(true));
    let deleteCalls = 0;
    server.use(
      http.delete(`*/api/products/${PRODUCT_ID}`, () => {
        deleteCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.headerMoreAria }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: dict.products.rowDelete }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: dict.products.deleteConfirm }),
    );

    await waitFor(() => expect(deleteCalls).toBe(1));
    // `replace`, not `push`: Back must not return to the edit URL of a product
    // that no longer resolves.
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/products"));
  });

  it("links to the read-only card and the preview from «⋯»", async () => {
    await renderAndWaitForForm(makeProduct(true));

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.headerMoreAria }),
    );
    expect(
      await screen.findByRole("menuitem", { name: dict.products.menuCard }),
    ).toHaveAttribute("href", `/products/${PRODUCT_ID}`);
    expect(
      screen.getByRole("menuitem", { name: dict.products.menuPreview }),
    ).toHaveAttribute("href", "/products/preview/chohol-magsafe");
  });

  it("offers no «Видалити…» without products:delete", async () => {
    stubProduct(makeProduct(true));
    renderWithProviders(
      <WithAuth permissions={["products:read", "products:write"]}>
        <EditProductView productId={PRODUCT_ID} />
      </WithAuth>,
    );
    await screen.findByRole("heading", { level: 2, name: "Чохол MagSafe" });
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.headerMoreAria }),
    );
    await screen.findByRole("menuitem", { name: dict.products.menuCard });
    expect(
      screen.queryByRole("menuitem", { name: dict.products.rowDelete }),
    ).toBeNull();
  });
});

describe("EditProductView — header (TASK-1050, Ф1)", () => {
  it("names the product, its status and its SKU / update line", async () => {
    await renderAndWaitForForm({ ...makeProduct(true), sku: "CASE-1" });

    expect(
      screen.getByRole("heading", { level: 2, name: "Чохол MagSafe" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(dict.products.statusShown).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        dict.products.editMeta(
          "CASE-1",
          formatDate("2026-06-01T09:00:00.000Z"),
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.products.back }),
    ).toHaveAttribute("href", "/products");
  });

  it("links «Подивитись на сайті» for a live product only", async () => {
    await renderAndWaitForForm(makeProduct(true));
    expect(
      screen.getByRole("link", { name: new RegExp(dict.products.viewOnSite) }),
    ).toHaveAttribute("href", `${STOREFRONT_URL}/products/chohol-magsafe`);
  });

  it("offers no storefront link for a hidden product", async () => {
    await renderAndWaitForForm(makeProduct(false));
    expect(
      screen.queryByRole("link", {
        name: new RegExp(dict.products.viewOnSite),
      }),
    ).toBeNull();
  });

  it("indexes the sections in the left column", async () => {
    await renderAndWaitForForm(makeProduct(true));
    const nav = screen.getByRole("navigation", {
      name: dict.productForm.sectionsNav,
    });
    for (const label of [
      dict.productForm.sectionMain,
      dict.productForm.sectionPrice,
      dict.productForm.sectionDescription,
      dict.productForm.sectionSpecs,
      dict.productForm.sectionPhotos,
      dict.productForm.sectionCompat,
      dict.productForm.sectionAddons,
      dict.productForm.sectionSeo,
    ]) {
      expect(
        within(nav).getByRole("link", { name: new RegExp(label) }),
      ).toBeInTheDocument();
    }
  });
});

describe("EditProductView — one «Зберегти» for the whole page (TASK-1050)", () => {
  const SPEC_DEF = {
    id: "def-magsafe",
    categoryId: "3f0e8f9a-1111-4222-8333-444455556666",
    key: "magsafe",
    label: "Підтримка MagSafe",
    type: "BOOLEAN",
    unit: null,
    options: [],
    isFilterable: true,
    sortOrder: 0,
  };

  beforeEach(() => {
    toastError.mockClear();
    toastSuccess.mockClear();
  });

  /** Specs + compat that can be edited, and the order every write lands in. */
  async function renderEditable(specsStatus = 200) {
    const order: string[] = [];
    const product = makeProduct(true);
    stubProduct(product);
    server.use(
      http.get(
        "*/api/categories/3f0e8f9a-1111-4222-8333-444455556666/effective-attribute-definitions",
        () => HttpResponse.json({ data: [SPEC_DEF] }),
      ),
      http.get("*/api/device-brands", () =>
        HttpResponse.json({
          data: [{ id: "b-1", name: "Apple", slug: "apple" }],
        }),
      ),
      http.get("*/api/device-models", () =>
        HttpResponse.json({
          data: [
            { id: "m-1", name: "iPhone 15", slug: "i15", deviceBrandId: "b-1" },
          ],
        }),
      ),
      http.put(`*/api/products/${PRODUCT_ID}`, () => {
        order.push("product");
        return HttpResponse.json({ data: product });
      }),
      http.put(`*/api/products/${PRODUCT_ID}/specs`, () => {
        order.push("specs");
        return specsStatus === 200
          ? HttpResponse.json({ data: {} })
          : HttpResponse.json(
              { message: "Значення не підходить" },
              { status: specsStatus },
            );
      }),
      http.put(`*/api/products/${PRODUCT_ID}/device-compat`, () => {
        order.push("compat");
        return HttpResponse.json({ data: { deviceModelIds: ["m-1"] } });
      }),
    );
    renderWithProviders(
      <WithAuth isOwner>
        <EditProductView productId={PRODUCT_ID} />
      </WithAuth>,
    );
    await screen.findByRole("group", { name: "Підтримка MagSafe" });
    await screen.findByLabelText("iPhone 15");
    return order;
  }

  async function editAllThree() {
    const name = screen.getByLabelText(dict.productForm.name);
    await userEvent.type(name, " New");
    await userEvent.click(
      within(
        screen.getByRole("group", { name: "Підтримка MagSafe" }),
      ).getByRole("button", { name: dict.productSpecs.booleanYes }),
    );
    await userEvent.click(screen.getByLabelText("iPhone 15"));
  }

  it("lists every section with unsaved edits in the sticky bar", async () => {
    await renderEditable();
    await editAllThree();

    expect(
      await screen.findByText(
        dict.canon.unsavedChanges(
          [
            dict.productForm.sectionMain,
            dict.productForm.sectionSpecs,
            dict.productForm.sectionCompat,
          ].join(", "),
        ),
      ),
    ).toBeInTheDocument();
    // Specs and compatibility have no save button of their own any more.
    expect(
      screen.queryByRole("button", { name: dict.productSpecs.save }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: dict.productCompat.save }),
    ).toBeNull();
  });

  it("saves product → specs → compatibility, in that order, with one toast", async () => {
    const order = await renderEditable();
    await editAllThree();

    await submit();

    await waitFor(() => expect(order).toEqual(["product", "specs", "compat"]));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(dict.products.toastUpdated),
    );
  });

  it("stops at the failing section, says which, and that the rest is saved", async () => {
    const order = await renderEditable(400);
    await editAllThree();

    await submit();

    await waitFor(() => expect(order).toEqual(["product", "specs"]));
    expect(
      await screen.findByText(
        dict.productForm.saveFailed(
          dict.productForm.sectionSpecs,
          "Значення не підходить",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        dict.productForm.savedPartly(dict.productForm.sectionMain),
      ),
    ).toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("«Скасувати зміни» throws away the edits of every section", async () => {
    await renderEditable();
    await editAllThree();

    await userEvent.click(
      screen.getByRole("button", { name: dict.canon.discardChanges }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText(dict.productForm.name)).toHaveValue(
        "Чохол MagSafe",
      ),
    );
    expect(screen.getByLabelText("iPhone 15")).not.toBeChecked();
    expect(
      within(
        screen.getByRole("group", { name: "Підтримка MagSafe" }),
      ).getByRole("button", { name: dict.productSpecs.booleanUnset }),
    ).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: dict.canon.discardChanges }),
      ).toBeNull(),
    );
  });
});
