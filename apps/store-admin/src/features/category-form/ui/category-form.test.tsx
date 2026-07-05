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

/** Stub the parent-options query with the given categories. */
function stubCategories(
  rows = [
    makeCategoryRow(UUID_A, "Category A"),
    makeCategoryRow(UUID_B, "Category B"),
  ],
) {
  server.use(
    http.get("*/api/admin/categories", () =>
      HttpResponse.json({
        data: rows,
        meta: { total: rows.length, page: 1, limit: 100, totalPages: 1 },
      }),
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
      http.get("*/api/admin/categories", async () => {
        await delay(ms);
        return HttpResponse.json({
          data: [
            makeCategoryRow(UUID_A, "Category A"),
            makeCategoryRow(UUID_B, "Category B"),
          ],
          meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
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
