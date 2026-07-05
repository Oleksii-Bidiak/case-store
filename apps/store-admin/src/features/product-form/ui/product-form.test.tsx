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
import type { ProductFormInput } from "../model/product-schema";

const CATEGORY_UUID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_UUID_B = "22222222-2222-4222-8222-222222222222";
const GROUP_UUID = "33333333-3333-4333-8333-333333333333";
const GROUP_UUID_B = "44444444-4444-4444-8444-444444444444";

/**
 * Stub the two queries the form fires on mount. Empty arrays are sufficient for
 * the slug-preview tests — none of them assert against the category/group lists.
 */
function stubFormQueries() {
  server.use(
    http.get("*/api/categories", () =>
      HttpResponse.json({
        data: [],
        meta: { total: 0, page: 1, limit: 100, totalPages: 0 },
      }),
    ),
    http.get("*/api/product-groups", () => HttpResponse.json({ data: [] })),
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
  function makeCategoryRow(id: string, name: string) {
    return {
      id,
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      description: null,
      image: null,
      parentId: null,
      sortOrder: 0,
      isActive: true,
      productCount: 0,
      createdAt: "2026-06-01T10:00:00.000Z",
      updatedAt: "2026-06-01T10:00:00.000Z",
    };
  }

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
      http.get("*/api/categories", async () => {
        await delay(ms);
        return HttpResponse.json({
          data: [
            makeCategoryRow(CATEGORY_UUID, "Category A"),
            makeCategoryRow(CATEGORY_UUID_B, "Category B"),
          ],
          meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
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
