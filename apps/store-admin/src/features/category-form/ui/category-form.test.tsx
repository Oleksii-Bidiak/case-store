import { http, HttpResponse, delay } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { CategoryForm } from "./category-form";
import {
  categoryFormValuesToDto,
  type CategoryFormValues,
} from "../model/category-schema";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

/**
 * TASK-291 (§3.11): the parent <Select> is now fed from the COMPLETE admin tree
 * (`GET /api/categories/admin/tree`, nested `AdminCategoryTreeNodeEntity`), not
 * from the 100-row-capped flat admin list — so these stubs serve the tree.
 */
function makeCategoryRow(id: string, name: string) {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    description: null,
    image: null,
    parentId: null,
    depth: 1,
    sortOrder: 0,
    isActive: true,
    productCount: 0,
    metaTitle: null,
    metaDescription: null,
    updatedAt: "2026-06-01T10:00:00.000Z",
    children: [],
  };
}

/** Stub the parent-options query with the given categories. */
function stubCategories(
  rows = [
    makeCategoryRow(UUID_A, "Category A"),
    makeCategoryRow(UUID_B, "Category B"),
  ],
) {
  server.use(
    http.get("*/api/categories/admin/tree", () =>
      HttpResponse.json({ data: rows }),
    ),
  );
}

/** Open the parent Select and pick the option with the given visible name. */
async function selectParent(name: string) {
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name }));
}

/** Click the form's submit button. */
async function submitForm() {
  await userEvent.click(
    screen.getByRole("button", { name: dict.categoryForm.submit }),
  );
}

describe("CategoryForm — parent persistence (TASK-149)", () => {
  it("CREATE: keeps the chosen parent through submit", async () => {
    stubCategories();
    const onSubmit = jest.fn();
    renderWithProviders(<CategoryForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(
      screen.getByLabelText(dict.categoryForm.name),
      "New Category",
    );
    await selectParent("Category A");
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Category", parentId: UUID_A }),
      expect.anything(),
    );
  });

  it("CREATE: parent stays visible while the submit is pending", async () => {
    stubCategories();
    const { rerender } = renderWithProviders(
      <CategoryForm onSubmit={jest.fn()} isPending={false} />,
    );

    await selectParent("Category A");
    rerender(<CategoryForm onSubmit={jest.fn()} isPending />);

    expect(screen.getByRole("combobox")).toHaveTextContent("Category A");
  });

  // NOTE: what an earlier revision of this file dismissed here as a "jsdom-only
  // artifact" was the real TASK-201 bug: Radix's hidden native bubble <select>
  // ITSELF dispatches a `change` event whenever the controlled value changes —
  // in every environment, browsers included. If the value is seeded before the
  // matching <option> mounts (parent options still loading), the native select
  // coerces it to "" and Radix's autofill handler bounces that "" back through
  // onValueChange, clearing the seeded parent. The form now ignores that ""
  // bounce; the edit-mode parent assertions live in the TASK-201 block below.
  it("EDIT: re-seeds fields from defaultValues on mount", async () => {
    stubCategories();
    renderWithProviders(
      <CategoryForm
        id="cat-1"
        defaultValues={{ name: "Sub", parentId: UUID_A }}
        onSubmit={jest.fn()}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(dict.categoryForm.name)).toHaveValue("Sub"),
    );
  });

  it("EDIT: a re-render with the same id does NOT reset a new selection", async () => {
    stubCategories();
    const onSubmit = jest.fn();
    const { rerender } = renderWithProviders(
      <CategoryForm
        id="cat-1"
        defaultValues={{ name: "Sub", parentId: UUID_A }}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    await selectParent("Category B");

    // Simulate a background refetch handing back a fresh defaultValues object
    // with the SAME entity id — Rule 2b must not clobber the in-progress edit.
    rerender(
      <CategoryForm
        id="cat-1"
        defaultValues={{ name: "Sub", parentId: UUID_A }}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: UUID_B }),
      expect.anything(),
    );
  });

  it("EDIT: changing the id prop re-seeds the form, same id does not (Rule 2b)", async () => {
    stubCategories();
    const nameField = () => screen.getByLabelText(dict.categoryForm.name);
    const { rerender } = renderWithProviders(
      <CategoryForm
        id="cat-1"
        defaultValues={{ name: "First", parentId: UUID_A }}
        onSubmit={jest.fn()}
        isPending={false}
      />,
    );

    await waitFor(() => expect(nameField()).toHaveValue("First"));

    // A background refetch (same id, fresh defaultValues object) must NOT clobber
    // an in-progress edit.
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), "Edited");
    rerender(
      <CategoryForm
        id="cat-1"
        defaultValues={{ name: "First", parentId: UUID_A }}
        onSubmit={jest.fn()}
        isPending={false}
      />,
    );
    expect(nameField()).toHaveValue("Edited");

    // Navigating to a different category (id changes) DOES re-seed the form.
    rerender(
      <CategoryForm
        id="cat-2"
        defaultValues={{ name: "Second", parentId: UUID_B }}
        onSubmit={jest.fn()}
        isPending={false}
      />,
    );
    await waitFor(() => expect(nameField()).toHaveValue("Second"));
  });
});

describe("CategoryForm — parent survives late-loading options (TASK-201)", () => {
  /** Stub the parent-options query with a delayed response. On a cold cache the
   *  edit form always mounts (and runs its id-keyed `reset()`) before the
   *  categories list arrives — this reproduces the QA sequence. */
  function stubCategoriesDelayed(ms = 75) {
    server.use(
      http.get("*/api/categories/admin/tree", async () => {
        await delay(ms);
        return HttpResponse.json({
          data: [
            makeCategoryRow(UUID_A, "Category A"),
            makeCategoryRow(UUID_B, "Category B"),
          ],
        });
      }),
    );
  }

  it("EDIT: parentId seeded before the options load survives through submit", async () => {
    stubCategoriesDelayed();
    const onSubmit = jest.fn();
    renderWithProviders(
      <CategoryForm
        id="cat-1"
        defaultValues={{ name: "Sub", parentId: UUID_A }}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    // Options arrive AFTER reset(); the trigger must show the current parent
    // once they do (not "Root"), without the user touching the field.
    await waitFor(() =>
      expect(screen.getByRole("combobox")).toHaveTextContent("Category A"),
    );

    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: UUID_A }),
      expect.anything(),
    );
  });

  it("EDIT: changing the parent after the options load late still sticks", async () => {
    stubCategoriesDelayed();
    const onSubmit = jest.fn();
    renderWithProviders(
      <CategoryForm
        id="cat-1"
        defaultValues={{ name: "Sub", parentId: UUID_A }}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("combobox")).toHaveTextContent("Category A"),
    );

    await selectParent("Category B");
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: UUID_B }),
      expect.anything(),
    );
  });

  it("EDIT: explicitly choosing Root still clears the parent (guard must not block it)", async () => {
    stubCategoriesDelayed();
    const onSubmit = jest.fn();
    renderWithProviders(
      <CategoryForm
        id="cat-1"
        defaultValues={{ name: "Sub", parentId: UUID_A }}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("combobox")).toHaveTextContent("Category A"),
    );

    await selectParent(dict.categoryForm.rootOption);
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "" }),
      expect.anything(),
    );
  });
});

describe("CategoryForm — SERP snippet preview (TASK-268)", () => {
  const previewTitle = () => screen.getByTestId("seo-snippet-title");
  const previewHint = () => screen.getByTestId("seo-snippet-hint");
  const titleCounter = () => screen.getByTestId("seo-snippet-title-counter");

  it("derives the branded title from the category name when meta is blank", async () => {
    stubCategories();
    renderWithProviders(
      <CategoryForm
        id="cat-1"
        defaultValues={{ name: "iPhone Cases" }}
        onSubmit={jest.fn()}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(previewTitle()).toHaveTextContent("iPhone Cases | MobileStore"),
    );
    expect(previewHint()).toHaveTextContent(dict.seoSnippetPreview.hintDerived);
  });

  it("live-updates the preview to the typed meta title and counter", async () => {
    stubCategories();
    renderWithProviders(
      <CategoryForm
        id="cat-1"
        defaultValues={{ name: "iPhone Cases" }}
        onSubmit={jest.fn()}
        isPending={false}
      />,
    );

    await userEvent.type(
      screen.getByLabelText(dict.categoryForm.metaTitle),
      "Best Cases",
    );

    await waitFor(() => expect(previewTitle()).toHaveTextContent("Best Cases"));
    expect(previewHint()).toHaveTextContent(dict.seoSnippetPreview.hintOwn);
    expect(titleCounter()).toHaveTextContent("10/60");
  });
});

describe("categoryFormValuesToDto — parent mapping (TASK-149)", () => {
  const baseValues: CategoryFormValues = {
    name: "Cat",
    slug: "",
    description: "",
    image: "",
    parentId: "",
    sortOrder: 0,
    isActive: true,
  };

  it("CREATE: blank parent → undefined (field omitted)", () => {
    const dto = categoryFormValuesToDto(baseValues);
    expect(dto.parentId).toBeUndefined();
  });

  it("UPDATE: blank parent → null (explicit clear)", () => {
    const dto = categoryFormValuesToDto(baseValues, { isUpdate: true });
    expect(dto.parentId).toBeNull();
  });

  it("passes a chosen parent through unchanged in both modes", () => {
    const values = { ...baseValues, parentId: UUID_A };
    expect(categoryFormValuesToDto(values).parentId).toBe(UUID_A);
    expect(categoryFormValuesToDto(values, { isUpdate: true }).parentId).toBe(
      UUID_A,
    );
  });
});

describe("categoryFormValuesToDto — SEO meta mapping (TASK-236)", () => {
  const baseValues: CategoryFormValues = {
    name: "Cat",
    slug: "",
    description: "",
    image: "",
    parentId: "",
    sortOrder: 0,
    isActive: true,
    metaTitle: "",
    metaDescription: "",
  };

  it("CREATE: blank meta fields → undefined (omitted)", () => {
    const dto = categoryFormValuesToDto(baseValues);
    expect(dto.metaTitle).toBeUndefined();
    expect(dto.metaDescription).toBeUndefined();
  });

  it("UPDATE: blank meta fields → null (explicit clear)", () => {
    const dto = categoryFormValuesToDto(baseValues, { isUpdate: true });
    expect(dto.metaTitle).toBeNull();
    expect(dto.metaDescription).toBeNull();
  });

  it("passes provided meta values through, trimmed, in both modes", () => {
    const values = {
      ...baseValues,
      metaTitle: "  SEO Title  ",
      metaDescription: "  SEO description  ",
    };
    expect(categoryFormValuesToDto(values).metaTitle).toBe("SEO Title");
    expect(
      categoryFormValuesToDto(values, { isUpdate: true }).metaDescription,
    ).toBe("SEO description");
  });
});

describe("CategoryForm — SEO meta fields (TASK-236)", () => {
  it("CREATE: submits typed meta title and description", async () => {
    stubCategories();
    const onSubmit = jest.fn();
    renderWithProviders(<CategoryForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(
      screen.getByLabelText(dict.categoryForm.name),
      "New Category",
    );
    await userEvent.type(
      screen.getByLabelText(dict.categoryForm.metaTitle),
      "Best Cases",
    );
    await userEvent.type(
      screen.getByLabelText(dict.categoryForm.metaDescription),
      "Shop the best cases",
    );
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        metaTitle: "Best Cases",
        metaDescription: "Shop the best cases",
      }),
      expect.anything(),
    );
  });

  it("EDIT: seeds the meta fields from defaultValues", async () => {
    stubCategories();
    renderWithProviders(
      <CategoryForm
        id="cat-1"
        defaultValues={{
          name: "Cases",
          metaTitle: "Seeded Title",
          metaDescription: "Seeded description",
        }}
        onSubmit={jest.fn()}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(dict.categoryForm.metaTitle)).toHaveValue(
        "Seeded Title",
      ),
    );
    expect(
      screen.getByLabelText(dict.categoryForm.metaDescription),
    ).toHaveValue("Seeded description");
  });
});
