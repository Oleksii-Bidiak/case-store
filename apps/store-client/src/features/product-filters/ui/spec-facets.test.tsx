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
});
