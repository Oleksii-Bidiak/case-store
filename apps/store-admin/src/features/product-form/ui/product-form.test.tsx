import { http, HttpResponse, delay } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ProductForm } from "./product-form";
import {
  productFormValuesToDto,
  type ProductFormInput,
  type ProductFormValues,
} from "../model/product-schema";

const CATEGORY_UUID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_UUID_B = "22222222-2222-4222-8222-222222222222";
const GROUP_UUID = "33333333-3333-4333-8333-333333333333";
const GROUP_UUID_B = "44444444-4444-4444-8444-444444444444";

interface TreeNodeStub {
  id: string;
  name: string;
  slug: string;
  description: null;
  image: null;
  isActive: boolean;
  sortOrder: number;
  children: TreeNodeStub[];
}

/** Build an admin-tree category node (TASK-236). Leaf nodes have no children. */
function makeTreeNode(
  id: string,
  name: string,
  children: TreeNodeStub[] = [],
): TreeNodeStub {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    description: null,
    image: null,
    isActive: true,
    sortOrder: 0,
    children,
  };
}

/**
 * Stub the two queries the form fires on mount. Empty arrays are sufficient for
 * the slug-preview tests — none of them assert against the category/group lists.
 * The category picker now reads the admin category TREE (TASK-236).
 */
function stubFormQueries() {
  server.use(
    http.get("*/api/categories/admin/tree", () =>
      HttpResponse.json({ data: [] }),
    ),
    http.get("*/api/product-groups", () => HttpResponse.json({ data: [] })),
    http.get("*/api/brands/admin/list", () =>
      HttpResponse.json({
        data: [],
        meta: { total: 0, page: 1, limit: 100, totalPages: 0 },
      }),
    ),
  );
}

const nameField = () => screen.getByLabelText(dict.productForm.name);
const slugField = () => screen.getByLabelText(dict.productForm.slug);
const preview = () => screen.queryByTestId("slug-preview");

const noop = () => {};

beforeEach(() => {
  stubFormQueries();
});

describe("ProductForm — live slug preview (TASK-136)", () => {
  it("CREATE: shows the derived slug when a name is typed and slug is blank", async () => {
    renderWithProviders(<ProductForm onSubmit={noop} isPending={false} />);

    await userEvent.type(nameField(), "iPhone 15 Pro Max");

    await waitFor(() => expect(preview()).toBeInTheDocument());
    expect(preview()).toHaveTextContent("iphone-15-pro-max");
  });

  it("CREATE: hides the preview once a manual slug is entered", async () => {
    renderWithProviders(<ProductForm onSubmit={noop} isPending={false} />);

    await userEvent.type(nameField(), "iPhone 15 Pro Max");
    await waitFor(() => expect(preview()).toBeInTheDocument());

    await userEvent.type(slugField(), "custom-slug");

    await waitFor(() => expect(preview()).not.toBeInTheDocument());
  });

  it("CREATE: renders no preview while the name is empty", () => {
    renderWithProviders(<ProductForm onSubmit={noop} isPending={false} />);

    expect(preview()).not.toBeInTheDocument();
  });

  it("EDIT: shows no preview on mount when the slug is pre-populated", async () => {
    const defaultValues: Partial<ProductFormInput> = {
      name: "Existing",
      slug: "existing-slug",
      price: "99",
      stock: "10",
      categoryId: CATEGORY_UUID,
      isActive: true,
    };
    renderWithProviders(
      <ProductForm
        defaultValues={defaultValues}
        onSubmit={noop}
        isPending={false}
      />,
    );

    await waitFor(() => expect(slugField()).toHaveValue("existing-slug"));
    expect(preview()).not.toBeInTheDocument();
  });

  it("EDIT: re-derives the preview when the slug field is cleared", async () => {
    const defaultValues: Partial<ProductFormInput> = {
      name: "Existing",
      slug: "existing-slug",
      price: "99",
      stock: "10",
      categoryId: CATEGORY_UUID,
      isActive: true,
    };
    renderWithProviders(
      <ProductForm
        defaultValues={defaultValues}
        onSubmit={noop}
        isPending={false}
      />,
    );

    await waitFor(() => expect(slugField()).toHaveValue("existing-slug"));

    await userEvent.clear(slugField());

    await waitFor(() => expect(preview()).toBeInTheDocument());
    expect(preview()).toHaveTextContent("existing");
  });
});

describe("ProductForm — category/group survive late-loading options (TASK-232)", () => {
  function makeGroupRow(id: string, name: string) {
    return { id, name, isActive: true, axes: [], positionCount: 0 };
  }

  /** Stub both option queries with delayed responses. On a cold cache the edit
   *  form always mounts (and gets its `values` seed applied) before the
   *  category/group lists arrive — this reproduces the TASK-201 QA sequence:
   *  the seeded id has no matching <option> in Radix's hidden native bubble
   *  <select>, coerces to "", and bounces "" through `onValueChange`. */
  function stubOptionQueriesDelayed(ms = 75) {
    server.use(
      http.get("*/api/categories/admin/tree", async () => {
        await delay(ms);
        // Two root-level LEAF categories — both selectable (TASK-236).
        return HttpResponse.json({
          data: [
            makeTreeNode(CATEGORY_UUID, "Category A"),
            makeTreeNode(CATEGORY_UUID_B, "Category B"),
          ],
        });
      }),
      http.get("*/api/product-groups", async () => {
        await delay(ms);
        return HttpResponse.json({
          data: [
            makeGroupRow(GROUP_UUID, "Group A"),
            makeGroupRow(GROUP_UUID_B, "Group B"),
          ],
        });
      }),
      http.get("*/api/brands/admin/list", async () => {
        await delay(ms);
        return HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 100, totalPages: 0 },
        });
      }),
    );
  }

  /** Valid edit-mode seed — categoryId and groupId are set before options load. */
  const editValues: Partial<ProductFormInput> = {
    name: "Existing",
    slug: "existing-slug",
    price: "99",
    stock: "10",
    categoryId: CATEGORY_UUID,
    groupId: GROUP_UUID,
    isActive: true,
  };

  const categoryTrigger = () =>
    screen.getByLabelText(dict.productForm.category);
  const groupTrigger = () => screen.getByLabelText(dict.productForm.group);

  async function selectOption(trigger: HTMLElement, name: string) {
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name }));
  }

  async function submitForm() {
    await userEvent.click(
      screen.getByRole("button", { name: dict.productForm.submit }),
    );
  }

  it("EDIT: category and group seeded before the options load survive through submit", async () => {
    stubOptionQueriesDelayed();
    const onSubmit = jest.fn();
    renderWithProviders(
      <ProductForm
        defaultValues={editValues}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    // Options arrive AFTER the form is seeded; both triggers must show the
    // current selection once they do, without the user touching the fields.
    await waitFor(() =>
      expect(categoryTrigger()).toHaveTextContent("Category A"),
    );
    await waitFor(() => expect(groupTrigger()).toHaveTextContent("Group A"));

    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: CATEGORY_UUID,
        groupId: GROUP_UUID,
      }),
      expect.anything(),
    );
  });

  it("EDIT: changing category and group after the options load late still sticks", async () => {
    stubOptionQueriesDelayed();
    const onSubmit = jest.fn();
    renderWithProviders(
      <ProductForm
        defaultValues={editValues}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(categoryTrigger()).toHaveTextContent("Category A"),
    );
    await waitFor(() => expect(groupTrigger()).toHaveTextContent("Group A"));

    await selectOption(categoryTrigger(), "Category B");
    await selectOption(groupTrigger(), "Group B");
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: CATEGORY_UUID_B,
        groupId: GROUP_UUID_B,
      }),
      expect.anything(),
    );
  });

  it("EDIT: explicitly choosing «Без групи» still clears the group (guard must not block it)", async () => {
    stubOptionQueriesDelayed();
    const onSubmit = jest.fn();
    renderWithProviders(
      <ProductForm
        defaultValues={editValues}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    await waitFor(() => expect(groupTrigger()).toHaveTextContent("Group A"));

    await selectOption(groupTrigger(), dict.productForm.groupNone);
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "" }),
      expect.anything(),
    );
  });
});

describe("productFormValuesToDto — SEO meta mapping (TASK-241)", () => {
  const baseValues: ProductFormValues = {
    name: "Clear Case",
    slug: "",
    description: "",
    price: 29.99,
    compareAtPrice: undefined,
    sku: "",
    stock: 0,
    categoryId: CATEGORY_UUID,
    groupId: "",
    brandId: "",
    positionOrder: 0,
    attributes: [],
    isActive: true,
    metaTitle: "",
    metaDescription: "",
  };

  it("CREATE: blank meta fields → undefined (omitted, not empty string)", () => {
    const dto = productFormValuesToDto(baseValues);
    expect(dto.metaTitle).toBeUndefined();
    expect(dto.metaDescription).toBeUndefined();
  });

  it("UPDATE: blank meta fields → null (explicit clear back to auto-derived, TASK-245)", () => {
    const dto = productFormValuesToDto(baseValues, { isUpdate: true });
    expect(dto.metaTitle).toBeNull();
    expect(dto.metaDescription).toBeNull();
  });

  it("passes provided meta values through, trimmed (create)", () => {
    const dto = productFormValuesToDto({
      ...baseValues,
      metaTitle: "  SEO Title  ",
      metaDescription: "  SEO description  ",
    });
    expect(dto.metaTitle).toBe("SEO Title");
    expect(dto.metaDescription).toBe("SEO description");
  });

  it("passes provided meta values through, trimmed (update)", () => {
    const dto = productFormValuesToDto(
      {
        ...baseValues,
        metaTitle: "  SEO Title  ",
        metaDescription: "  SEO description  ",
      },
      { isUpdate: true },
    );
    expect(dto.metaTitle).toBe("SEO Title");
    expect(dto.metaDescription).toBe("SEO description");
  });
});

describe("ProductForm — SEO meta fields (TASK-241)", () => {
  const validDefaults: Partial<ProductFormInput> = {
    name: "Clear Case",
    slug: "clear-case",
    price: "29.99",
    stock: "5",
    categoryId: CATEGORY_UUID,
    isActive: true,
  };

  const metaTitleField = () =>
    screen.getByLabelText(dict.productForm.metaTitle);
  const metaDescriptionField = () =>
    screen.getByLabelText(dict.productForm.metaDescription);

  it("renders the meta title/description fields with their plain-UA hints", () => {
    renderWithProviders(<ProductForm onSubmit={noop} isPending={false} />);

    expect(metaTitleField()).toBeInTheDocument();
    expect(metaDescriptionField()).toBeInTheDocument();
    expect(
      screen.getByText(dict.productForm.metaTitleHint),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.productForm.metaDescriptionHint),
    ).toBeInTheDocument();
  });

  it("submits typed meta title and description", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <ProductForm
        defaultValues={validDefaults}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    await userEvent.type(metaTitleField(), "Best Clear Case");
    await userEvent.type(metaDescriptionField(), "Shop the best clear case");
    await userEvent.click(
      screen.getByRole("button", { name: dict.productForm.submit }),
    );

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        metaTitle: "Best Clear Case",
        metaDescription: "Shop the best clear case",
      }),
      expect.anything(),
    );
  });

  it("EDIT: seeds the meta fields from defaultValues", async () => {
    renderWithProviders(
      <ProductForm
        defaultValues={{
          ...validDefaults,
          metaTitle: "Seeded Title",
          metaDescription: "Seeded description",
        }}
        onSubmit={noop}
        isPending={false}
      />,
    );

    await waitFor(() => expect(metaTitleField()).toHaveValue("Seeded Title"));
    expect(metaDescriptionField()).toHaveValue("Seeded description");
  });
});

describe("ProductForm — leaf-only category picker (TASK-236)", () => {
  const ROOT_UUID = "55555555-5555-4555-8555-555555555555";
  const CHILD_UUID = "66666666-6666-4666-8666-666666666666";
  const STANDALONE_UUID = "77777777-7777-4777-8777-777777777777";

  /** Root "Cases" has a child "iPhone Cases"; "Chargers" is a standalone leaf. */
  function stubAdminTree() {
    server.use(
      http.get("*/api/categories/admin/tree", () =>
        HttpResponse.json({
          data: [
            makeTreeNode(ROOT_UUID, "Cases", [
              makeTreeNode(CHILD_UUID, "iPhone Cases"),
            ]),
            makeTreeNode(STANDALONE_UUID, "Chargers"),
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
    );
  }

  const categoryTrigger = () =>
    screen.getByLabelText(dict.productForm.category);

  it("offers leaf categories (incl. a standalone root) but NOT a branch category", async () => {
    stubAdminTree();
    renderWithProviders(<ProductForm onSubmit={noop} isPending={false} />);

    await userEvent.click(categoryTrigger());

    // The leaf child is selectable, indented to show its ancestry.
    expect(
      await screen.findByRole("option", { name: "— iPhone Cases" }),
    ).toBeInTheDocument();
    // A standalone root with no children is itself a leaf → selectable.
    expect(
      screen.getByRole("option", { name: "Chargers" }),
    ).toBeInTheDocument();
    // The branch category "Cases" (has children) must NOT be offered.
    expect(
      screen.queryByRole("option", { name: "Cases" }),
    ).not.toBeInTheDocument();
  });

  it("writes the chosen leaf category id on submit", async () => {
    stubAdminTree();
    const onSubmit = jest.fn();
    renderWithProviders(
      <ProductForm
        defaultValues={{
          name: "Clear Case",
          slug: "clear-case",
          price: "29.99",
          stock: "5",
          isActive: true,
        }}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    await userEvent.click(categoryTrigger());
    await userEvent.click(
      await screen.findByRole("option", { name: "— iPhone Cases" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.productForm.submit }),
    );

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: CHILD_UUID }),
      expect.anything(),
    );
  });
});
