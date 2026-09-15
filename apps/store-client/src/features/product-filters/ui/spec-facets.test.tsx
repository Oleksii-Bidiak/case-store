import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { SpecFacets } from "./spec-facets";

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";

function stubFacets(rows: unknown[]) {
  server.use(
    http.get("*/api/categories/:id/filterable-specs", () =>
      HttpResponse.json({ data: rows }),
    ),
  );
}

function facet(key: string, label: string, values: string[]) {
  return {
    definition: {
      id: `def-${key}`,
      categoryId: CATEGORY_ID,
      key,
      label,
      type: "SELECT",
      unit: null,
      options: values,
      isFilterable: true,
      sortOrder: 0,
    },
    values,
  };
}

const materialFacet = facet("material", "Матеріал", ["Силікон", "Шкіра"]);
const formFacet = facet("form", "Форм-фактор", ["Накладка", "Книжка"]);

describe("SpecFacets (TASK-191)", () => {
  it("renders nothing without an active category", () => {
    const { container } = renderWithProviders(
      <SpecFacets categoryId={undefined} onFilterChange={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the category has no filterable specs", async () => {
    stubFacets([]);
    const { container } = renderWithProviders(
      <SpecFacets categoryId={CATEGORY_ID} onFilterChange={jest.fn()} />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders a checkbox per value and writes ?specs=key:value on selection", async () => {
    stubFacets([materialFacet]);
    const onFilterChange = jest.fn();

    renderWithProviders(
      <SpecFacets categoryId={CATEGORY_ID} onFilterChange={onFilterChange} />,
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Шкіра" }),
    );

    expect(onFilterChange).toHaveBeenCalledWith({ specs: "material:Шкіра" });
  });

  it("clears the specs param when the last ticked value is unticked", async () => {
    stubFacets([materialFacet]);
    const onFilterChange = jest.fn();

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        specs="material:Шкіра"
        onFilterChange={onFilterChange}
      />,
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Шкіра" }),
    );

    expect(onFilterChange).toHaveBeenCalledWith({ specs: undefined });
  });

  it("reflects the values already in the URL as checked", async () => {
    stubFacets([materialFacet]);

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        specs="material:Силікон,Шкіра"
        onFilterChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByRole("checkbox", { name: "Силікон" }),
    ).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Шкіра" })).toBeChecked();
  });
});

/**
 * TASK-414 / owner decision B-10. The previous control could express exactly one
 * `key:value` pair: every selection overwrote the whole param, so ticking a
 * value in a second facet silently discarded the first. These are the tests that
 * fail against that version.
 */
describe("SpecFacets — multi-select (TASK-414)", () => {
  it("ACCUMULATES values inside one facet instead of replacing them", async () => {
    stubFacets([materialFacet]);
    const onFilterChange = jest.fn();

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        specs="material:Силікон"
        onFilterChange={onFilterChange}
      />,
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Шкіра" }),
    );

    expect(onFilterChange).toHaveBeenCalledWith({
      specs: "material:Силікон,Шкіра",
    });
  });

  it("KEEPS the first facet when a second facet is selected", async () => {
    stubFacets([materialFacet, formFacet]);
    const onFilterChange = jest.fn();

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        specs="material:Силікон"
        onFilterChange={onFilterChange}
      />,
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Накладка" }),
    );

    expect(onFilterChange).toHaveBeenCalledWith({
      specs: "material:Силікон;form:Накладка",
    });
  });

  it("removes only the unticked value, leaving the rest of the selection", async () => {
    stubFacets([materialFacet, formFacet]);
    const onFilterChange = jest.fn();

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        specs="material:Силікон,Шкіра;form:Накладка"
        onFilterChange={onFilterChange}
      />,
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Шкіра" }),
    );

    expect(onFilterChange).toHaveBeenCalledWith({
      specs: "material:Силікон;form:Накладка",
    });
  });

  // The old cut hard-capped the panel at TWO facets whatever the category
  // declared; the rest were simply unreachable.
  it("offers more than two facets, folding the extras behind «Ще фільтри»", async () => {
    stubFacets([
      facet("a", "Фасет A", ["a1"]),
      facet("b", "Фасет B", ["b1"]),
      facet("c", "Фасет C", ["c1"]),
      facet("d", "Фасет D", ["d1"]),
    ]);

    renderWithProviders(
      <SpecFacets categoryId={CATEGORY_ID} onFilterChange={jest.fn()} />,
    );

    // Three expanded up front — already more than the old ceiling of two.
    expect(
      await screen.findByRole("checkbox", { name: "a1" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "c1" })).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "d1" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: dict.filters.moreFacets(1) }),
    );

    expect(screen.getByRole("checkbox", { name: "d1" })).toBeInTheDocument();
  });

  it("caps the facets at the server's own ceiling of six", async () => {
    stubFacets(
      Array.from({ length: 9 }, (_, i) =>
        facet(`k${i}`, `Фасет ${i}`, [`v${i}`]),
      ),
    );

    renderWithProviders(
      <SpecFacets categoryId={CATEGORY_ID} onFilterChange={jest.fn()} />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: dict.filters.moreFacets(3) }),
    );

    expect(screen.getByRole("checkbox", { name: "v5" })).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "v6" }),
    ).not.toBeInTheDocument();
  });

  // ── colour swatches (TASK-487 / owner decision B-10) ──────────────────────

  describe("the colour facet", () => {
    const colorFacet = facet("color", "Колір", [
      "Чорний",
      "Білий",
      "Не існує такого кольору",
    ]);

    it("renders a swatch per colour, still as a real checkbox", async () => {
      stubFacets([colorFacet]);

      renderWithProviders(
        <SpecFacets categoryId={CATEGORY_ID} onFilterChange={jest.fn()} />,
      );

      // The accessible name is the colour NAME, not a hex value: a shopper who
      // cannot tell «Сірий» from «Графітовий» by the dot still reads the word,
      // and keyboard/Space toggling comes free from the native input.
      expect(
        await screen.findByRole("checkbox", { name: "Чорний" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: "Білий" }),
      ).toBeInTheDocument();
    });

    it("writes ?specs=color:<value> on selection, like any other facet", async () => {
      stubFacets([colorFacet]);
      const onFilterChange = jest.fn();

      renderWithProviders(
        <SpecFacets categoryId={CATEGORY_ID} onFilterChange={onFilterChange} />,
      );

      await userEvent.click(
        await screen.findByRole("checkbox", { name: "Чорний" }),
      );

      expect(onFilterChange).toHaveBeenCalledWith({ specs: "color:Чорний" });
    });

    it("accumulates colours within the facet and un-ticks on a second click", async () => {
      stubFacets([colorFacet]);
      const onFilterChange = jest.fn();

      const { rerender } = renderWithProviders(
        <SpecFacets
          categoryId={CATEGORY_ID}
          specs="color:Чорний"
          onFilterChange={onFilterChange}
        />,
      );

      const black = await screen.findByRole("checkbox", { name: "Чорний" });
      expect(black).toBeChecked();

      await userEvent.click(screen.getByRole("checkbox", { name: "Білий" }));
      expect(onFilterChange).toHaveBeenCalledWith({
        specs: "color:Чорний,Білий",
      });

      rerender(
        <SpecFacets
          categoryId={CATEGORY_ID}
          specs="color:Чорний"
          onFilterChange={onFilterChange}
        />,
      );
      await userEvent.click(screen.getByRole("checkbox", { name: "Чорний" }));
      expect(onFilterChange).toHaveBeenLastCalledWith({ specs: undefined });
    });

    it("still renders a colour it cannot resolve to a CSS colour", async () => {
      // `colorSwatch` falls back to a neutral gradient rather than guessing.
      // Dropping the value would hide a filter that matches real products.
      stubFacets([colorFacet]);

      renderWithProviders(
        <SpecFacets categoryId={CATEGORY_ID} onFilterChange={jest.fn()} />,
      );

      expect(
        await screen.findByRole("checkbox", {
          name: "Не існує такого кольору",
        }),
      ).toBeInTheDocument();
    });

    it("renders plain checkboxes for every OTHER facet", async () => {
      stubFacets([colorFacet, materialFacet]);

      renderWithProviders(
        <SpecFacets categoryId={CATEGORY_ID} onFilterChange={jest.fn()} />,
      );

      // Both are checkboxes; what differs is the chrome around them, so this
      // asserts the non-colour facet is untouched by the swatch branch.
      expect(
        await screen.findByRole("checkbox", { name: "Силікон" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Матеріал")).toBeInTheDocument();
      expect(screen.getByText("Колір")).toBeInTheDocument();
    });
  });

  // TASK-487. Definitions are declared on a ROOT category and inherited by every
  // descendant, so an inherited facet can legitimately have no values in the
  // subcategory being browsed — «Колір» in a category of screen protectors, say.
  it("renders nothing for a facet with no values", async () => {
    stubFacets([facet("color", "Колір", []), materialFacet]);

    renderWithProviders(
      <SpecFacets categoryId={CATEGORY_ID} onFilterChange={jest.fn()} />,
    );

    expect(
      await screen.findByRole("checkbox", { name: "Силікон" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Колір")).not.toBeInTheDocument();
  });

  it("renders nothing at all when EVERY facet is empty", async () => {
    stubFacets([facet("color", "Колір", [])]);

    const { container } = renderWithProviders(
      <SpecFacets categoryId={CATEGORY_ID} onFilterChange={jest.fn()} />,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  // ── the widened facet set (TASK-488 / owner decision B-10) ────────────────
  // B-10 let a facet be a BOOLEAN as well as a SELECT, and promoted a spec that
  // carries a unit. Both store values that are unreadable raw.
  describe("facets that are not plain SELECTs", () => {
    function typedFacet(
      key: string,
      label: string,
      values: string[],
      type: string,
      unit: string | null = null,
    ) {
      const base = facet(key, label, values);
      return { ...base, definition: { ...base.definition, type, unit } };
    }

    it("labels a BOOLEAN facet «Так» / «Ні», not true / false", async () => {
      stubFacets([
        typedFacet(
          "magsafe",
          "Підтримка MagSafe",
          ["false", "true"],
          "BOOLEAN",
        ),
      ]);
      const onFilterChange = jest.fn();

      renderWithProviders(
        <SpecFacets categoryId={CATEGORY_ID} onFilterChange={onFilterChange} />,
      );

      expect(
        await screen.findByRole("checkbox", { name: "Так" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Ні" })).toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", { name: "true" }),
      ).not.toBeInTheDocument();
    });

    it("keeps the STORED value in the URL while showing «Так»", async () => {
      // The label is for the shopper; the param is the API contract.
      stubFacets([
        typedFacet(
          "magsafe",
          "Підтримка MagSafe",
          ["false", "true"],
          "BOOLEAN",
        ),
      ]);
      const onFilterChange = jest.fn();

      renderWithProviders(
        <SpecFacets categoryId={CATEGORY_ID} onFilterChange={onFilterChange} />,
      );

      await userEvent.click(
        await screen.findByRole("checkbox", { name: "Так" }),
      );

      expect(onFilterChange).toHaveBeenCalledWith({ specs: "magsafe:true" });
    });

    it("appends the unit of a facet that has one", async () => {
      stubFacets([
        typedFacet("ports", "Кількість портів", ["1", "2"], "SELECT", "шт"),
      ]);

      renderWithProviders(
        <SpecFacets categoryId={CATEGORY_ID} onFilterChange={jest.fn()} />,
      );

      expect(
        await screen.findByRole("checkbox", { name: "2 шт" }),
      ).toBeInTheDocument();
    });
  });
});
