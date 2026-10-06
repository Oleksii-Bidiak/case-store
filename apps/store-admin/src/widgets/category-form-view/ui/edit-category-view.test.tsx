import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
  type RenderWithProvidersOptions,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { toast } from "@/shared/ui/toast";
import { getCategoryControllerGetAdminTreeQueryKey } from "@/entities/category";
import { EditCategoryView } from "./edit-category-view";

const mockPush = jest.fn();
// next/navigation is unavailable under jsdom — mock the router.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush }),
}));

jest.mock("@/shared/ui/toast", () => ({
  UNDO_TOAST_DURATION_MS: 10_000,
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    undo: jest.fn(),
    dismiss: jest.fn(),
  },
}));

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";

function makeCategory(
  isActive: boolean,
  texts: { description?: string; metaTitle?: string } = {},
) {
  return {
    id: CATEGORY_ID,
    name: "Чохли",
    slug: "chohly",
    description: texts.description ?? null,
    image: null,
    parentId: null,
    isActive,
    sortOrder: 0,
    metaTitle: texts.metaTitle ?? null,
    metaDescription: null,
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-01T09:00:00.000Z",
    // TASK-655: the delete dialog's preview. Empty here, so the card's delete
    // test runs the target-less variant (ДН-2.9).
    deletionImpact: {
      subcategoryCount: 0,
      productCount: 0,
      carouselCount: 0,
      carousels: [],
      deletedProductCount: 0,
    },
  };
}

function treeNode(
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name,
    slug: name,
    description: null,
    image: null,
    isActive: true,
    sortOrder: 0,
    metaTitle: null,
    metaDescription: null,
    updatedAt: "2026-06-01T09:00:00.000Z",
    parentId: null,
    productCount: 0,
    subtreeProductCount: 0,
    depth: 1,
    children: [],
    ...extra,
  };
}

function stubCategory(
  category: ReturnType<typeof makeCategory>,
  {
    addonStatus = 200,
    putStatus = 200,
  }: { addonStatus?: number; putStatus?: number } = {},
) {
  const calls: string[] = [];
  const putCalls: unknown[] = [];
  const addonCalls: unknown[] = [];
  server.use(
    // Parent options + header counts — the COMPLETE admin tree (TASK-291).
    http.get("*/api/categories/admin/tree", () =>
      HttpResponse.json({
        data: [
          treeNode(CATEGORY_ID, "Чохли", {
            slug: "chohly",
            isActive: category.isActive,
            productCount: 0,
            subtreeProductCount: 30,
            children: [
              treeNode(CHILD_ID, "Чохли для iPhone", {
                parentId: CATEGORY_ID,
                depth: 2,
                productCount: 30,
                subtreeProductCount: 30,
              }),
            ],
          }),
        ],
      }),
    ),
    // Characteristics section (TASK-191).
    http.get(`*/api/categories/${CATEGORY_ID}/attribute-definitions`, () =>
      HttpResponse.json({ data: [] }),
    ),
    // Add-on services section (TASK-174).
    http.get("*/api/addon-services/admin/active", () =>
      HttpResponse.json({
        data: [
          {
            id: "svc-1",
            name: "Гарантія",
            description: null,
            price: "499.00",
            isActive: true,
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
          },
        ],
      }),
    ),
    http.get("*/api/addon-services/templates/category/:categoryId", () =>
      HttpResponse.json({ data: { addonServiceIds: [] } }),
    ),
    http.get(
      "*/api/addon-services/templates/category/:categoryId/resolved",
      () =>
        HttpResponse.json({
          data: {
            source: "none",
            sourceCategoryId: null,
            sourceCategoryName: null,
            addons: [],
          },
        }),
    ),
    http.patch(
      "*/api/addon-services/templates/category/:categoryId",
      async ({ request }) => {
        calls.push("addons");
        addonCalls.push(await request.json());
        return addonStatus === 200
          ? HttpResponse.json({ data: { addonServiceIds: ["svc-1"] } })
          : HttpResponse.json({ message: "boom" }, { status: addonStatus });
      },
    ),
    http.get(`*/api/admin/categories/${CATEGORY_ID}`, () =>
      HttpResponse.json({ data: category }),
    ),
    http.put(`*/api/admin/categories/${CATEGORY_ID}`, async ({ request }) => {
      calls.push("category");
      putCalls.push(await request.json());
      return putStatus === 200
        ? HttpResponse.json({ data: category })
        : HttpResponse.json({ message: "boom" }, { status: putStatus });
    }),
  );
  return { calls, putCalls, addonCalls };
}

const WRITER = { permissions: ["categories:write"] };

async function renderAndWaitForForm(
  category: ReturnType<typeof makeCategory>,
  options?: Parameters<typeof stubCategory>[1],
  auth?: RenderWithProvidersOptions["auth"],
) {
  const stubs = stubCategory(category, options);
  const { queryClient } = renderWithProviders(
    <EditCategoryView categoryId={CATEGORY_ID} />,
    // The form is the editor's — `categories:write` (TASK-1781).
    { auth: auth ?? WRITER },
  );
  await waitFor(() =>
    expect(screen.getByLabelText(dict.categoryForm.slug)).toHaveValue(
      category.slug,
    ),
  );
  return { ...stubs, queryClient };
}

const submit = () =>
  userEvent.click(screen.getByRole("button", { name: dict.common.save }));

beforeEach(() => {
  mockPush.mockClear();
  (toast.success as jest.Mock).mockClear();
  (toast.error as jest.Mock).mockClear();
});

describe("EditCategoryView — slug-rename guard (TASK-285)", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    // Wave 198: an AlertDialog — `window.confirm` must never be reached.
    confirmSpy = jest.spyOn(window, "confirm");
  });

  afterEach(() => {
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  async function changeSlug() {
    const slugField = screen.getByLabelText(dict.categoryForm.slug);
    await userEvent.clear(slugField);
    await userEvent.type(slugField, "nova-adresa");
    await submit();
  }

  it("submits without any confirm when the slug is unchanged on an active category", async () => {
    const { putCalls } = await renderAndWaitForForm(makeCategory(true));

    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("blocks the update when the admin cancels the active-slug-change dialog", async () => {
    const { putCalls } = await renderAndWaitForForm(makeCategory(true));

    await changeSlug();

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      dict.categories.slugChangeConfirm("chohly", "nova-adresa"),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(putCalls).toHaveLength(0);
  });

  it("fires the update after the admin accepts the dialog", async () => {
    const { putCalls } = await renderAndWaitForForm(makeCategory(true));

    await changeSlug();
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: dict.categories.slugChangeConfirmAction,
      }),
    );

    await waitFor(() => expect(putCalls).toHaveLength(1));
  });

  it("never asks about a slug change on an INACTIVE category", async () => {
    const { putCalls } = await renderAndWaitForForm(makeCategory(false));

    await changeSlug();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("EditCategoryView — cache invalidation (TASK-291-K)", () => {
  it("invalidates the admin-tree query after a successful save", async () => {
    const { putCalls, queryClient } = await renderAndWaitForForm(
      makeCategory(true),
    );
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    // The treegrid reads the admin-tree query; a rename or a parent change made
    // through the form's kept <Select> must not leave it stale (§3.11).
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: getCategoryControllerGetAdminTreeQueryKey(),
      }),
    );
  });
});

describe("EditCategoryView — CategoriesProposal КТ5 (wave 198)", () => {
  it("heads the page with the name, the site status and the counts", async () => {
    await renderAndWaitForForm(makeCategory(true));

    expect(
      screen.getByRole("link", { name: dict.categories.back }),
    ).toHaveAttribute("href", "/categories");
    expect(
      screen.getByRole("heading", { level: 2, name: "Чохли" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.categories.tree.statusShown),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText(dict.categories.headerProducts(30, 1), {
          exact: false,
        }),
      ).toHaveTextContent("/categories/chohly"),
    );
  });

  it("«⋯» offers the category on the site, in a new tab", async () => {
    await renderAndWaitForForm(makeCategory(true));

    await userEvent.click(
      screen.getByRole("button", { name: dict.categories.headerMenuAria }),
    );
    expect(
      await screen.findByRole("menuitem", { name: dict.categories.openOnSite }),
    ).toHaveAttribute("href", `${STOREFRONT_URL}/categories/chohly`);
  });

  it("puts every section in one form: characteristics and add-on services included", async () => {
    await renderAndWaitForForm(makeCategory(true));

    const nav = screen.getByRole("navigation", {
      name: dict.categoryForm.sectionsAria,
    });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual([
      dict.categoryForm.sectionMain,
      dict.categoryForm.sectionImage,
      dict.categoryForm.sectionAttributes,
      dict.categoryForm.sectionAddons,
      dict.categoryForm.sectionSeo,
    ]);
    // ONE save button on the page — the add-on section lost its own.
    expect(screen.getAllByRole("button", { name: /Зберегти/ })).toHaveLength(1);
  });

  it("one «Зберегти» saves the category FIRST, then the add-on services, then leaves", async () => {
    const { calls, addonCalls } = await renderAndWaitForForm(
      makeCategory(false),
    );

    await userEvent.click(await screen.findByLabelText("Гарантія"));
    const bar = document.querySelector('[data-slot="form-actions-bar"]');
    expect(bar).toHaveTextContent(
      dict.canon.unsavedChanges(dict.categoryForm.sectionAddons),
    );

    await submit();

    await waitFor(() => expect(calls).toEqual(["category", "addons"]));
    expect(addonCalls[0]).toEqual({ addonServiceIds: ["svc-1"] });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(dict.categories.toastUpdated),
    );
    expect(mockPush).toHaveBeenCalledWith("/categories");
  });

  it("does not touch the add-on services when nobody changed them", async () => {
    const { calls } = await renderAndWaitForForm(makeCategory(false));

    await submit();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/categories"));
    expect(calls).toEqual(["category"]);
  });

  it("stops at the first failing section: the category fails → add-ons are not sent", async () => {
    const { calls } = await renderAndWaitForForm(makeCategory(false), {
      putStatus: 500,
    });

    await userEvent.click(await screen.findByLabelText("Гарантія"));
    await submit();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        dict.categories.saveStepFailed("", dict.categoryForm.sectionMain),
      ),
    );
    expect(calls).toEqual(["category"]);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("says what DID save when a later section fails, and stays on the page", async () => {
    const { calls } = await renderAndWaitForForm(makeCategory(false), {
      addonStatus: 500,
    });

    await userEvent.click(await screen.findByLabelText("Гарантія"));
    await submit();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        dict.categories.saveStepFailed(
          dict.categoryForm.sectionMain,
          dict.categoryForm.sectionAddons,
        ),
      ),
    );
    expect(calls).toEqual(["category", "addons"]);
    expect(mockPush).not.toHaveBeenCalled();
    // The add-on edit is still on screen, still unsaved.
    expect(screen.getByLabelText("Гарантія")).toBeChecked();
  });
});

describe("EditCategoryView — «Видалити…» on the card (TASK-655, ДН-2.12)", () => {
  const dd = dict.categories.delete;

  it("has no delete button without categories:delete", async () => {
    // A writer who may not delete.
    await renderAndWaitForForm(makeCategory(true));

    expect(
      screen.queryByRole("button", { name: dd.action }),
    ).not.toBeInTheDocument();
  });

  it("deletes through the same dialog and goes back to /categories", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.delete(
        `*/api/admin/categories/${CATEGORY_ID}`,
        async ({ request }) => {
          bodies.push(await request.json());
          // TASK-1775: the delete answers with what it did.
          return HttpResponse.json({
            data: { targetId: null, movedProducts: 0, switchedCarousels: 0 },
          });
        },
      ),
    );
    await renderAndWaitForForm(makeCategory(true), undefined, {
      permissions: ["categories:write", "categories:delete"],
    });

    await userEvent.click(screen.getByRole("button", { name: dd.action }));
    const alert = await screen.findByRole("alertdialog");
    expect(
      within(alert).getByRole("heading", { name: dd.title("Чохли") }),
    ).toBeInTheDocument();
    await userEvent.click(
      await within(alert).findByRole("button", { name: dd.confirm }),
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/categories"));
    expect(bodies).toEqual([{}]);
    expect(toast.success).toHaveBeenCalledWith(dd.toastDone("Чохли"));
  });
});

describe("EditCategoryView — categories:delete without categories:write (TASK-1781)", () => {
  const ro = dict.categories.readOnly;

  function renderDeleteOnly() {
    const reads: string[] = [];
    stubCategory(
      makeCategory(true, {
        description: "Чохли для смартфонів",
        metaTitle: "Чохли — магазин",
      }),
    );
    // The editor-only sections must not even be asked for.
    server.use(
      http.get(`*/api/categories/${CATEGORY_ID}/attribute-definitions`, () => {
        reads.push("attributes");
        return HttpResponse.json({ data: [] });
      }),
      http.get("*/api/addon-services/templates/category/:categoryId", () => {
        reads.push("addons");
        return HttpResponse.json({ data: { addonServiceIds: [] } });
      }),
    );
    renderWithProviders(<EditCategoryView categoryId={CATEGORY_ID} />, {
      auth: { permissions: ["categories:delete"] },
    });
    return { reads };
  }

  it("shows the card read-only — no form, no «Зберегти», one plain notice", async () => {
    const { reads } = renderDeleteOnly();

    expect(await screen.findByText(ro.cardNotice)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.common.save }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(dict.categoryForm.slug),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    // What the category is, as definitions.
    const term = (label: string) =>
      screen.getByText(label, { selector: "dt" }).nextElementSibling;
    expect(term(ro.fieldName)).toHaveTextContent("Чохли");
    expect(term(ro.fieldAddress)).toHaveTextContent("/categories/chohly");
    expect(term(ro.fieldParent)).toHaveTextContent(ro.fieldParentRoot);
    expect(term(ro.fieldDescription)).toHaveTextContent("Чохли для смартфонів");
    expect(term(ro.fieldMetaTitle)).toHaveTextContent("Чохли — магазин");
    expect(term(ro.fieldMetaDescription)).toHaveTextContent(ro.empty);

    expect(reads).toEqual([]);
  });

  it("keeps «Видалити» in the header", async () => {
    renderDeleteOnly();
    expect(
      await screen.findByRole("button", {
        name: dict.categories.delete.action,
      }),
    ).toBeInTheDocument();
  });
});
