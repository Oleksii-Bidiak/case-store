import { http, HttpResponse } from "msw";
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
