import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AttributeDefinitionEditor } from "./attribute-definition-editor";

const d = dict.attributeDefinitions;
const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";

function def(
  id: string,
  label: string,
  type: "TEXT" | "NUMBER" | "BOOLEAN" | "SELECT",
  extra: { options?: string[]; isFilterable?: boolean; unit?: string } = {},
) {
  return {
    id,
    categoryId: CATEGORY_ID,
    key: label.toLowerCase(),
    label,
    type,
    unit: extra.unit ?? null,
    options: extra.options ?? [],
    isFilterable: extra.isFilterable ?? false,
    sortOrder: 0,
  };
}

const OWN = [
  def("d1", "Колір", "SELECT", {
    options: ["Чорний", "Білий", "Синій", "Червоний", "Зелений"],
    isFilterable: true,
  }),
  def("d2", "MagSafe", "BOOLEAN", { isFilterable: true }),
  def("d3", "Захист", "TEXT"),
  def("d4", "Вага", "NUMBER", { unit: "г" }),
];

function arrange({
  own = OWN,
  effective = OWN,
  limit = 6,
}: {
  own?: ReturnType<typeof def>[];
  effective?: ReturnType<typeof def>[];
  limit?: number;
} = {}) {
  const calls = { reorder: [] as unknown[], deleted: [] as string[] };
  server.use(
    http.get("*/api/categories/:id/attribute-definitions", () =>
      HttpResponse.json({ data: own }),
    ),
    http.get("*/api/categories/:id/effective-attribute-definitions", () =>
      HttpResponse.json({ data: effective }),
    ),
    http.get("*/api/categories/:id/facet-ceiling", () =>
      HttpResponse.json({ data: { limit, categories: [] } }),
    ),
    http.patch(
      "*/api/categories/:id/attribute-definitions/reorder",
      async ({ request }) => {
        calls.reorder.push(await request.json());
        return HttpResponse.json({ data: own });
      },
    ),
    http.delete("*/api/attribute-definitions/:id", ({ params }) => {
      calls.deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

const rowOf = async (label: string) =>
  (await screen.findByText(label)).closest("li") as HTMLElement;

describe("AttributeDefinitionEditor — CategoriesProposal КТ5 (wave 198)", () => {
  it("speaks of types in the operator's words, with «у фільтрах» on facets", async () => {
    arrange();
    renderWithProviders(
      <AttributeDefinitionEditor categoryId={CATEGORY_ID} id="attrs" />,
    );

    const colour = await rowOf("Колір");
    expect(colour).toHaveTextContent(`${d.typeSelect} · 5 варіантів`);
    expect(within(colour).getByText(d.filterableBadge)).toBeInTheDocument();

    const magsafe = await rowOf("MagSafe");
    expect(magsafe).toHaveTextContent(d.typeBoolean);
    expect(within(magsafe).getByText(d.filterableBadge)).toBeInTheDocument();

    const protection = await rowOf("Захист");
    expect(protection).toHaveTextContent(d.typeTextLine);
    expect(
      within(protection).queryByText(d.filterableBadge),
    ).not.toBeInTheDocument();

    const weight = await rowOf("Вага");
    expect(weight).toHaveTextContent(`${d.typeNumberLine} · г`);

    // The raw enum is gone from the screen.
    expect(screen.queryByText(/SELECT|BOOLEAN/)).not.toBeInTheDocument();
  });

  it("is a titled section with its anchor id", async () => {
    arrange();
    renderWithProviders(
      <AttributeDefinitionEditor categoryId={CATEGORY_ID} id="attrs" />,
    );
    const section = await screen.findByRole("region", { name: d.heading });
    expect(section).toHaveAttribute("id", "attrs");
  });

  it("says «зараз N з 6» from the EFFECTIVE (own + inherited) facets", async () => {
    arrange({
      effective: [
        ...OWN,
        def("p1", "Бренд", "SELECT", { options: ["A"], isFilterable: true }),
      ],
    });
    renderWithProviders(<AttributeDefinitionEditor categoryId={CATEGORY_ID} />);

    expect(await screen.findByText(d.facetNow(3, 6))).toBeInTheDocument();
  });

  it("paints the count as a warning when the category is over the ceiling", async () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      def(`f${i}`, `Фасет ${i}`, "BOOLEAN", { isFilterable: true }),
    );
    arrange({ effective: many });
    renderWithProviders(<AttributeDefinitionEditor categoryId={CATEGORY_ID} />);

    expect(await screen.findByText(d.facetNow(7, 6))).toHaveClass(
      "text-warning",
    );
  });

  it("keeps every row action in «⋯»: up, down, edit, delete", async () => {
    const calls = arrange();
    renderWithProviders(<AttributeDefinitionEditor categoryId={CATEGORY_ID} />);

    const magsafe = await rowOf("MagSafe");
    await userEvent.click(
      within(magsafe).getByRole("button", {
        name: d.rowActionsAria("MagSafe"),
      }),
    );
    expect(
      await screen.findByRole("menuitem", { name: d.moveUp }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: d.moveDown }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: d.edit })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: d.removeMenu }),
    ).toBeInTheDocument();

    // «Вгору» swaps MagSafe above Колір — the same reorder call as before.
    await userEvent.click(screen.getByRole("menuitem", { name: d.moveUp }));
    await waitFor(() => expect(calls.reorder).toHaveLength(1));
    expect(calls.reorder[0]).toEqual({ orderedIds: ["d2", "d1", "d3", "d4"] });
  });

  it("«Редагувати» opens the dialog with the definition", async () => {
    arrange();
    renderWithProviders(<AttributeDefinitionEditor categoryId={CATEGORY_ID} />);

    const colour = await rowOf("Колір");
    await userEvent.click(
      within(colour).getByRole("button", { name: d.rowActionsAria("Колір") }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.edit }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(d.editTitle)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(d.label)).toHaveValue("Колір");
  });

  it("deletes only after an AlertDialog — never window.confirm", async () => {
    const calls = arrange();
    const confirmSpy = jest.spyOn(window, "confirm");
    renderWithProviders(<AttributeDefinitionEditor categoryId={CATEGORY_ID} />);

    const protection = await rowOf("Захист");
    await userEvent.click(
      within(protection).getByRole("button", {
        name: d.rowActionsAria("Захист"),
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.removeMenu }),
    );

    const alert = await screen.findByRole("alertdialog");
    expect(alert).toHaveTextContent(d.removeTitle("Захист"));
    expect(alert).toHaveTextContent(d.confirmRemove);
    expect(calls.deleted).toEqual([]);

    await userEvent.click(
      within(alert).getByRole("button", { name: d.remove }),
    );
    await waitFor(() => expect(calls.deleted).toEqual(["d3"]));
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
