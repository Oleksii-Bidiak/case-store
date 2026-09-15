import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { ActiveFilterChips } from "./active-filter-chips";

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";

function stubFacets(rows: unknown[]) {
  server.use(
    http.get("*/api/categories/:id/filterable-specs", () =>
      HttpResponse.json({ data: rows }),
    ),
  );
}

function facet(
  key: string,
  label: string,
  values: string[],
  type = "SELECT",
  unit: string | null = null,
) {
  return {
    definition: {
      id: `def-${key}`,
      categoryId: CATEGORY_ID,
      key,
      label,
      type,
      unit,
      options: values,
      isFilterable: true,
      sortOrder: 0,
    },
    values,
  };
}

/**
 * The chips row's spec labels (TASK-488).
 *
 * B-10 made BOOLEAN specs facets, and a BOOLEAN stores the literal "true".
 * Without the facet list the chip above the grid would read «true» — and with
 * two boolean facets selected, two chips would read the same thing.
 */
describe("ActiveFilterChips — spec chips", () => {
  it("names the facet and renders «Так» for a boolean selection", async () => {
    stubFacets([facet("magsafe", "MagSafe", ["false", "true"], "BOOLEAN")]);

    renderWithProviders(
      <ActiveFilterChips
        currentParams={{ category: "cases", specs: "magsafe:true" }}
        categoryId={CATEGORY_ID}
        onFilterChange={jest.fn()}
      />,
    );

    expect(await screen.findByText(/MagSafe: Так/)).toBeInTheDocument();
  });

  it("appends the unit of a facet that has one", async () => {
    stubFacets([
      facet("ports", "Кількість портів", ["1", "2"], "SELECT", "шт"),
    ]);

    renderWithProviders(
      <ActiveFilterChips
        currentParams={{ specs: "ports:2" }}
        categoryId={CATEGORY_ID}
        onFilterChange={jest.fn()}
      />,
    );

    expect(await screen.findByText(/2 шт/)).toBeInTheDocument();
  });

  it("shows the bare value for a plain SELECT, as it always has", async () => {
    stubFacets([facet("material", "Матеріал", ["Силікон", "TPU"])]);

    renderWithProviders(
      <ActiveFilterChips
        currentParams={{ specs: "material:Силікон" }}
        categoryId={CATEGORY_ID}
        onFilterChange={jest.fn()}
      />,
    );

    expect(await screen.findByText(/Силікон/)).toBeInTheDocument();
  });

  it("renders the raw value when no category is active to resolve it", () => {
    // No categoryId means no facet list — the chip must still appear and still
    // be removable, just unlabelled.
    renderWithProviders(
      <ActiveFilterChips
        currentParams={{ specs: "material:Силікон" }}
        onFilterChange={jest.fn()}
      />,
    );

    expect(screen.getByText(/Силікон/)).toBeInTheDocument();
  });
});
