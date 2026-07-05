import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ProductSpecsEditor } from "./product-specs-editor";

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const d = dict.productSpecs;

function stubEffectiveDefinitions(rows: unknown[]) {
  server.use(
    http.get("*/api/categories/:id/effective-attribute-definitions", () =>
      HttpResponse.json({ data: rows }),
    ),
  );
}

const materialDef = {
  id: "def-material",
  categoryId: CATEGORY_ID,
  key: "material",
  label: "Матеріал",
  type: "SELECT",
  unit: null,
  options: ["Силікон", "Шкіра"],
  isFilterable: true,
  sortOrder: 0,
};

describe("ProductSpecsEditor (TASK-191)", () => {
  it("prompts to pick a category when none is selected", () => {
    renderWithProviders(
      <ProductSpecsEditor
        productId={PRODUCT_ID}
        categoryId=""
        initialSpecs={[]}
      />,
    );
    expect(screen.getByText(d.noCategory)).toBeInTheDocument();
  });

  it("renders a typed input per effective definition seeded from saved values", async () => {
    stubEffectiveDefinitions([materialDef]);

    renderWithProviders(
      <ProductSpecsEditor
        productId={PRODUCT_ID}
        categoryId={CATEGORY_ID}
        initialSpecs={[
          {
            key: "material",
            label: "Матеріал",
            type: "SELECT",
            unit: null,
            value: "Шкіра",
            isFilterable: true,
          },
        ]}
      />,
    );

    // The SELECT input renders with the seeded value shown.
    expect(await screen.findByText("Шкіра")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: d.save })).toBeInTheDocument();
  });

  it("shows the empty state when the category has no effective definitions", async () => {
    stubEffectiveDefinitions([]);

    renderWithProviders(
      <ProductSpecsEditor
        productId={PRODUCT_ID}
        categoryId={CATEGORY_ID}
        initialSpecs={[]}
      />,
    );

    expect(await screen.findByText(d.empty)).toBeInTheDocument();
  });

  it("saves the filled values via the specs endpoint", async () => {
    stubEffectiveDefinitions([materialDef]);
    let captured: unknown = null;
    server.use(
      http.put("*/api/products/:id/specs", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ data: {} });
      }),
    );

    renderWithProviders(
      <ProductSpecsEditor
        productId={PRODUCT_ID}
        categoryId={CATEGORY_ID}
        initialSpecs={[
          {
            key: "material",
            label: "Матеріал",
            type: "SELECT",
            unit: null,
            value: "Шкіра",
            isFilterable: true,
          },
        ]}
      />,
    );

    await screen.findByText("Шкіра");
    await userEvent.click(screen.getByRole("button", { name: d.save }));

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured).toEqual({
      specs: [{ definitionId: "def-material", value: "Шкіра" }],
    });
  });
});
