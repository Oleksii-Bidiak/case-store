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

const materialFacet = {
  definition: {
    id: "def-material",
    categoryId: CATEGORY_ID,
    key: "material",
    label: "Матеріал",
    type: "SELECT",
    unit: null,
    options: ["Силікон", "Шкіра"],
    isFilterable: true,
    sortOrder: 0,
  },
  values: ["Силікон", "Шкіра"],
};

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

  it("renders a facet select and writes ?specs=key:value on selection", async () => {
    stubFacets([materialFacet]);
    const onFilterChange = jest.fn();

    renderWithProviders(
      <SpecFacets categoryId={CATEGORY_ID} onFilterChange={onFilterChange} />,
    );

    // The facet label appears once the query resolves.
    expect(await screen.findByText("Матеріал")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Шкіра" }));

    expect(onFilterChange).toHaveBeenCalledWith({ specs: "material:Шкіра" });
  });

  it("clears the specs param when 'any' is chosen", async () => {
    stubFacets([materialFacet]);
    const onFilterChange = jest.fn();

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        specs="material:Шкіра"
        onFilterChange={onFilterChange}
      />,
    );

    await screen.findByText("Матеріал");
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(
      await screen.findByRole("option", { name: dict.filters.specAnyOption }),
    );

    expect(onFilterChange).toHaveBeenCalledWith({ specs: undefined });
  });
});
