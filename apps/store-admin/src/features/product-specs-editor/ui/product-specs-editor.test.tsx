import { createRef } from "react";
import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
  act,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { SectionSaveController } from "@/shared/lib/section-save";
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

const magsafeDef = {
  id: "def-magsafe",
  categoryId: CATEGORY_ID,
  key: "magsafe",
  label: "Підтримка MagSafe",
  type: "BOOLEAN" as const,
  unit: null,
  options: [],
  isFilterable: true,
  sortOrder: 1,
};

const savedMagsafe = (value: string) => ({
  key: "magsafe",
  label: "Підтримка MagSafe",
  type: "BOOLEAN" as const,
  unit: null,
  value,
  isFilterable: true,
});

describe("ProductSpecsEditor — так / ні / не вказано (TASK-1050)", () => {
  it("shows a saved «false» as «Ні», never as the raw word", async () => {
    stubEffectiveDefinitions([magsafeDef]);
    renderWithProviders(
      <ProductSpecsEditor
        productId={PRODUCT_ID}
        categoryId={CATEGORY_ID}
        initialSpecs={[savedMagsafe("false")]}
      />,
    );

    const group = await screen.findByRole("group", {
      name: "Підтримка MagSafe",
    });
    expect(
      within(group).getByRole("button", { name: d.booleanNo }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(group).getByRole("button", { name: d.booleanYes }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("false")).toBeNull();
  });

  it("«Не вказано» takes the value out of the payload", async () => {
    stubEffectiveDefinitions([magsafeDef]);
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
        initialSpecs={[savedMagsafe("true")]}
      />,
    );

    const group = await screen.findByRole("group", {
      name: "Підтримка MagSafe",
    });
    await userEvent.click(
      within(group).getByRole("button", { name: d.booleanUnset }),
    );
    await userEvent.click(screen.getByRole("button", { name: d.save }));
    await waitFor(() => expect(captured).toEqual({ specs: [] }));
  });
});

describe("ProductSpecsEditor — saved by the form's one «Зберегти» (TASK-1050)", () => {
  it("drops its own button, reports dirty, and saves / discards on command", async () => {
    stubEffectiveDefinitions([magsafeDef]);
    let captured: unknown = null;
    server.use(
      http.put("*/api/products/:id/specs", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ data: {} });
      }),
    );
    const controller = createRef<SectionSaveController>();
    const onDirtyChange = jest.fn();
    renderWithProviders(
      <ProductSpecsEditor
        productId={PRODUCT_ID}
        categoryId={CATEGORY_ID}
        initialSpecs={[savedMagsafe("false")]}
        controllerRef={controller}
        onDirtyChange={onDirtyChange}
      />,
    );

    const group = await screen.findByRole("group", {
      name: "Підтримка MagSafe",
    });
    expect(screen.queryByRole("button", { name: d.save })).toBeNull();

    await userEvent.click(
      within(group).getByRole("button", { name: d.booleanYes }),
    );
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

    act(() => controller.current?.discard());
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    expect(
      within(group).getByRole("button", { name: d.booleanNo }),
    ).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(
      within(group).getByRole("button", { name: d.booleanYes }),
    );
    await act(async () => {
      await controller.current?.save();
    });
    expect(captured).toEqual({
      specs: [{ definitionId: "def-magsafe", value: "true" }],
    });
  });
});
