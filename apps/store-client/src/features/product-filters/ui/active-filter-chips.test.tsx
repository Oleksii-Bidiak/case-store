import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
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
    // Counted since TASK-489 — the chips row reads only the definition, but the
    // fixture must still be the shape the endpoint actually returns.
    values: values.map((value, index) => ({ value, count: index + 1 })),
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

/** TASK-742 — «Зі знижкою» gets a removable chip like availability. */
describe("ActiveFilterChips — on sale (TASK-742)", () => {
  it("shows a chip for ?onSale=true that removes just that param", async () => {
    const onFilterChange = jest.fn();
    renderWithProviders(
      <ActiveFilterChips
        currentParams={{ onSale: true, inStock: true }}
        onFilterChange={onFilterChange}
      />,
    );

    const chip = screen.getByRole("button", {
      name: new RegExp(`^${dict.filters.onSaleChip}`),
    });
    await userEvent.click(chip);

    expect(onFilterChange).toHaveBeenCalledWith({ onSale: undefined });
  });

  it("shows no sale chip when the filter is off", () => {
    renderWithProviders(
      <ActiveFilterChips
        currentParams={{ onSale: false, inStock: true }}
        onFilterChange={jest.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: new RegExp(`^${dict.filters.onSaleChip}`),
      }),
    ).not.toBeInTheDocument();
  });

  it("is cleared by «Очистити все» along with the rest", async () => {
    const onFilterChange = jest.fn();
    renderWithProviders(
      <ActiveFilterChips
        currentParams={{ onSale: true }}
        onFilterChange={onFilterChange}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: dict.filters.clearAll }),
    );

    expect(onFilterChange.mock.calls.at(-1)![0]).toHaveProperty(
      "onSale",
      undefined,
    );
  });
});
