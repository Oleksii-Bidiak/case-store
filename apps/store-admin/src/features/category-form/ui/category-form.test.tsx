import { http, HttpResponse } from "msw";
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

  // NOTE on the edit-mode (Rule 2b) tests below: the reset-keyed-to-id mechanism
  // is asserted through the `name` field (a plain `register` input) rather than
  // the parent Select. Radix's hidden BubbleSelect only registers its native
  // <option>s while the listbox is open, so when `reset()` seeds a value while
  // the list is closed, jsdom fires a spurious `change` on the optionless native
  // <select> that resets the Radix value — a jsdom-only artifact (a real browser
  // never fires `change` for a programmatic value change). The parent-specific
  // behaviour is covered by the CREATE submit test, the "same id" test below
  // (a real user selection, which the artifact does not affect), and the
  // categoryFormValuesToDto unit tests.
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
