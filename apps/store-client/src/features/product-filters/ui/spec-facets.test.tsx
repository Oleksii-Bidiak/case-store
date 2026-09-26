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

/** Query string of the last facet request MSW served, for the forwarding test. */
let lastFacetQuery: URLSearchParams | undefined;

function stubFacets(rows: unknown[]) {
  server.use(
    http.get("*/api/categories/:id/filterable-specs", ({ request }) => {
      lastFacetQuery = new URL(request.url).searchParams;
      return HttpResponse.json({ data: rows });
    }),
  );
}

/**
 * A facet as the API returns it since TASK-489: every value carries the number
 * of products behind it. Counts default to `1, 2, 3…` so the fixtures stay
 * readable; the tests that care about a specific number pass it explicitly.
 */
function facet(
  key: string,
  label: string,
  values: Array<string | [string, number]>,
) {
  const counted = values.map((entry, index) =>
    Array.isArray(entry)
      ? { value: entry[0], count: entry[1] }
      : { value: entry, count: index + 1 },
  );
  return {
    definition: {
      id: `def-${key}`,
      categoryId: CATEGORY_ID,
      key,
      label,
      type: "SELECT",
      unit: null,
      options: counted.map((entry) => entry.value),
      isFilterable: true,
      sortOrder: 0,
    },
    values: counted,
  };
}

/**
 * The accessible name of a facet control is now «<значення> <N> товарів»
 * (TASK-489) — the count is deliberately INSIDE the `<label>` rather than a
 * visual-only decoration, so it is part of what a screen reader announces.
 * These tests therefore match the value at the start of the name rather than
 * the whole of it.
 */
function control(label: string): RegExp {
  return new RegExp(
    `^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+\\d+\\s`,
  );
}

const materialFacet = facet("material", "Матеріал", ["Силікон", "Шкіра"]);
const formFacet = facet("form", "Форм-фактор", ["Накладка", "Книжка"]);

describe("SpecFacets (TASK-191)", () => {
  beforeEach(() => {
    lastFacetQuery = undefined;
  });

  it("renders nothing without an active category", () => {
    const { container } = renderWithProviders(
      <SpecFacets
        categoryId={undefined}
        currentParams={{}}
        onFilterChange={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the category has no filterable specs", async () => {
    stubFacets([]);
    const { container } = renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{}}
        onFilterChange={jest.fn()}
      />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders a checkbox per value and writes ?specs=key:value on selection", async () => {
    stubFacets([materialFacet]);
    const onFilterChange = jest.fn();

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{}}
        onFilterChange={onFilterChange}
      />,
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: control("Шкіра") }),
    );

    expect(onFilterChange).toHaveBeenCalledWith({ specs: "material:Шкіра" });
  });

  it("clears the specs param when the last ticked value is unticked", async () => {
    stubFacets([materialFacet]);
    const onFilterChange = jest.fn();

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{ specs: "material:Шкіра" }}
        onFilterChange={onFilterChange}
      />,
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: control("Шкіра") }),
    );

    expect(onFilterChange).toHaveBeenCalledWith({ specs: undefined });
  });

  it("reflects the values already in the URL as checked", async () => {
    stubFacets([materialFacet]);

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{ specs: "material:Силікон,Шкіра" }}
        onFilterChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByRole("checkbox", { name: control("Силікон") }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: control("Шкіра") }),
    ).toBeChecked();
  });
});

/**
 * TASK-489 / owner decision B-10 §4 — «Силікон (12)», where 12 accounts for the
 * other filters already selected, and a value absent from the current slice is
 * not offered at all.
 */
describe("SpecFacets — value counts (TASK-489)", () => {
  beforeEach(() => {
    lastFacetQuery = undefined;
  });

  it("shows the number of products behind each value", async () => {
    stubFacets([
      facet("material", "Матеріал", [
        ["Силікон", 12],
        ["Шкіра", 3],
      ]),
    ]);

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{}}
        onFilterChange={jest.fn()}
      />,
    );

    expect(await screen.findByText("(12)")).toBeInTheDocument();
    expect(screen.getByText("(3)")).toBeInTheDocument();
  });

  it("puts the count in the control's ACCESSIBLE NAME, not just on screen", async () => {
    stubFacets([facet("material", "Матеріал", [["Силікон", 12]])]);

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{}}
        onFilterChange={jest.fn()}
      />,
    );

    // «12 товарів», not a bare numeral glued to the value's name.
    expect(
      await screen.findByRole("checkbox", { name: "Силікон 12 товарів" }),
    ).toBeInTheDocument();
  });

  it("offers ONLY the values the API returned — a value with none is absent", async () => {
    // The definition still declares TPU as an option; the API omits it because
    // nothing in this slice carries it. Before this task the control was built
    // from `options`, so a shopper could tick TPU and land on an empty page.
    stubFacets([
      {
        ...facet("material", "Матеріал", [["Силікон", 12]]),
        definition: {
          ...facet("material", "Матеріал", []).definition,
          options: ["Силікон", "TPU"],
        },
      },
    ]);

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{}}
        onFilterChange={jest.fn()}
      />,
    );

    await screen.findByRole("checkbox", { name: control("Силікон") });
    expect(
      screen.queryByRole("checkbox", { name: /TPU/ }),
    ).not.toBeInTheDocument();
  });

  it("asks the API for counts that account for every OTHER active filter", async () => {
    stubFacets([materialFacet]);

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{
          brand: "apple",
          device: "iphone-15",
          minPrice: 100,
          maxPrice: 900,
          search: "чохол",
          specs: "form:Накладка",
          inStock: true,
          // Paging and sorting move rows between pages, never in or out of the
          // slice — they must NOT reach the facet request, or every page-flip
          // would refetch an identical set of counts.
          page: 3,
          sortBy: "price",
        }}
        onFilterChange={jest.fn()}
      />,
    );

    await screen.findByRole("checkbox", { name: control("Силікон") });

    expect(lastFacetQuery?.get("brand")).toBe("apple");
    expect(lastFacetQuery?.get("device")).toBe("iphone-15");
    expect(lastFacetQuery?.get("minPrice")).toBe("100");
    expect(lastFacetQuery?.get("maxPrice")).toBe("900");
    expect(lastFacetQuery?.get("search")).toBe("чохол");
    expect(lastFacetQuery?.get("specs")).toBe("form:Накладка");
    expect(lastFacetQuery?.get("inStock")).toBe("true");
    expect(lastFacetQuery?.get("page")).toBeNull();
    expect(lastFacetQuery?.get("sortBy")).toBeNull();
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
        currentParams={{ specs: "material:Силікон" }}
        onFilterChange={onFilterChange}
      />,
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: control("Шкіра") }),
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
        currentParams={{ specs: "material:Силікон" }}
        onFilterChange={onFilterChange}
      />,
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: control("Накладка") }),
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
        currentParams={{ specs: "material:Силікон,Шкіра;form:Накладка" }}
        onFilterChange={onFilterChange}
      />,
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: control("Шкіра") }),
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
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{}}
        onFilterChange={jest.fn()}
      />,
    );

    // Three expanded up front — already more than the old ceiling of two.
    expect(
      await screen.findByRole("checkbox", { name: control("a1") }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: control("c1") }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: control("d1") }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: dict.filters.moreFacets(1) }),
    );

    expect(
      screen.getByRole("checkbox", { name: control("d1") }),
    ).toBeInTheDocument();
  });

  // The ceiling is the API's `MAX_SPEC_FACETS` since TASK-707 — ONE constant.
  // A second cut here, with its own copy of the number, is what could drop a
  // facet the API deliberately kept (an active one past the template ceiling).
  it("offers every facet the API returns — it does not re-cut the list", async () => {
    stubFacets(
      Array.from({ length: 7 }, (_, i) =>
        facet(`k${i}`, `Фасет ${i}`, [`v${i}`]),
      ),
    );

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{}}
        onFilterChange={jest.fn()}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: dict.filters.moreFacets(4) }),
    );

    expect(
      screen.getByRole("checkbox", { name: control("v6") }),
    ).toBeInTheDocument();
  });

  it("offers an ACTIVE facet the API kept past the template ceiling, ticked", async () => {
    // What the API answers for `?specs=k7:v7` on a category with eight facets:
    // the first five in template order plus the active one (TASK-707).
    stubFacets([
      ...Array.from({ length: 5 }, (_, i) =>
        facet(`k${i}`, `Фасет ${i}`, [`v${i}`]),
      ),
      facet("k7", "Фасет 7", ["v7"]),
    ]);

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{ specs: "k7:v7" }}
        onFilterChange={jest.fn()}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: dict.filters.moreFacets(3) }),
    );

    expect(screen.getByRole("checkbox", { name: control("v7") })).toBeChecked();
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
        <SpecFacets
          categoryId={CATEGORY_ID}
          currentParams={{}}
          onFilterChange={jest.fn()}
        />,
      );

      // The accessible name starts with the colour NAME, not a hex value: a
      // shopper who cannot tell «Сірий» from «Графітовий» by the dot still reads
      // the word, and keyboard/Space toggling comes free from the native input.
      expect(
        await screen.findByRole("checkbox", { name: control("Чорний") }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: control("Білий") }),
      ).toBeInTheDocument();
    });

    it("carries the count too, in the swatch's accessible name", async () => {
      stubFacets([facet("color", "Колір", [["Чорний", 7]])]);

      renderWithProviders(
        <SpecFacets
          categoryId={CATEGORY_ID}
          currentParams={{}}
          onFilterChange={jest.fn()}
        />,
      );

      expect(
        await screen.findByRole("checkbox", { name: "Чорний 7 товарів" }),
      ).toBeInTheDocument();
    });

    it("writes ?specs=color:<value> on selection, like any other facet", async () => {
      stubFacets([colorFacet]);
      const onFilterChange = jest.fn();

      renderWithProviders(
        <SpecFacets
          categoryId={CATEGORY_ID}
          currentParams={{}}
          onFilterChange={onFilterChange}
        />,
      );

      await userEvent.click(
        await screen.findByRole("checkbox", { name: control("Чорний") }),
      );

      expect(onFilterChange).toHaveBeenCalledWith({ specs: "color:Чорний" });
    });

    it("accumulates colours within the facet and un-ticks on a second click", async () => {
      stubFacets([colorFacet]);
      const onFilterChange = jest.fn();

      const { rerender } = renderWithProviders(
        <SpecFacets
          categoryId={CATEGORY_ID}
          currentParams={{ specs: "color:Чорний" }}
          onFilterChange={onFilterChange}
        />,
      );

      const black = await screen.findByRole("checkbox", {
        name: control("Чорний"),
      });
      expect(black).toBeChecked();

      await userEvent.click(
        screen.getByRole("checkbox", { name: control("Білий") }),
      );
      expect(onFilterChange).toHaveBeenCalledWith({
        specs: "color:Чорний,Білий",
      });

      rerender(
        <SpecFacets
          categoryId={CATEGORY_ID}
          currentParams={{ specs: "color:Чорний" }}
          onFilterChange={onFilterChange}
        />,
      );
      await userEvent.click(
        screen.getByRole("checkbox", { name: control("Чорний") }),
      );
      expect(onFilterChange).toHaveBeenLastCalledWith({ specs: undefined });
    });

    it("still renders a colour it cannot resolve to a CSS colour", async () => {
      // `colorSwatch` falls back to a neutral gradient rather than guessing.
      // Dropping the value would hide a filter that matches real products.
      stubFacets([colorFacet]);

      renderWithProviders(
        <SpecFacets
          categoryId={CATEGORY_ID}
          currentParams={{}}
          onFilterChange={jest.fn()}
        />,
      );

      expect(
        await screen.findByRole("checkbox", {
          name: control("Не існує такого кольору"),
        }),
      ).toBeInTheDocument();
    });

    it("renders plain checkboxes for every OTHER facet", async () => {
      stubFacets([colorFacet, materialFacet]);

      renderWithProviders(
        <SpecFacets
          categoryId={CATEGORY_ID}
          currentParams={{}}
          onFilterChange={jest.fn()}
        />,
      );

      // Both are checkboxes; what differs is the chrome around them, so this
      // asserts the non-colour facet is untouched by the swatch branch.
      expect(
        await screen.findByRole("checkbox", { name: control("Силікон") }),
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
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{}}
        onFilterChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByRole("checkbox", { name: control("Силікон") }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Колір")).not.toBeInTheDocument();
  });

  it("renders nothing at all when EVERY facet is empty", async () => {
    stubFacets([facet("color", "Колір", [])]);

    const { container } = renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{}}
        onFilterChange={jest.fn()}
      />,
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
      values: Array<string | [string, number]>,
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
        <SpecFacets
          categoryId={CATEGORY_ID}
          currentParams={{}}
          onFilterChange={onFilterChange}
        />,
      );

      expect(
        await screen.findByRole("checkbox", { name: control("Так") }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: control("Ні") }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", { name: /true/ }),
      ).not.toBeInTheDocument();
    });

    it("composes the count WITH the «Так» relabelling, not instead of it", async () => {
      stubFacets([
        typedFacet("magsafe", "Підтримка MagSafe", [["true", 4]], "BOOLEAN"),
      ]);

      renderWithProviders(
        <SpecFacets
          categoryId={CATEGORY_ID}
          currentParams={{}}
          onFilterChange={jest.fn()}
        />,
      );

      expect(
        await screen.findByRole("checkbox", { name: "Так 4 товари" }),
      ).toBeInTheDocument();
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
        <SpecFacets
          categoryId={CATEGORY_ID}
          currentParams={{}}
          onFilterChange={onFilterChange}
        />,
      );

      await userEvent.click(
        await screen.findByRole("checkbox", { name: control("Так") }),
      );

      expect(onFilterChange).toHaveBeenCalledWith({ specs: "magsafe:true" });
    });

    it("appends the unit of a facet that has one", async () => {
      stubFacets([
        typedFacet("ports", "Кількість портів", ["1", "2"], "SELECT", "шт"),
      ]);

      renderWithProviders(
        <SpecFacets
          categoryId={CATEGORY_ID}
          currentParams={{}}
          onFilterChange={jest.fn()}
        />,
      );

      expect(
        await screen.findByRole("checkbox", { name: control("2 шт") }),
      ).toBeInTheDocument();
    });
  });
});

/**
 * TASK-540 — the API cuts `?specs=` at 20 values per facet and 6 facets, and
 * answers 400 past 600 characters. A control that could be ticked past those
 * caps would be drawn checked while the grid ignored it.
 */
describe("SpecFacets — the server's ?specs= caps (TASK-540)", () => {
  const twentyOne = Array.from({ length: 21 }, (_, i) => `V${i + 1}`);
  const manyFacet = facet("material", "Матеріал", twentyOne);
  const twentySelected = `material:${twentyOne.slice(0, 20).join(",")}`;

  it("disables a 21st value in a facet, with a note saying why", async () => {
    stubFacets([manyFacet]);

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{ specs: twentySelected }}
        onFilterChange={jest.fn()}
      />,
    );

    const blocked = await screen.findByRole("checkbox", {
      name: control("V21"),
    });
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveAccessibleDescription(dict.filters.specLimitReached);
    expect(screen.getByText(dict.filters.specLimitReached)).toBeVisible();
  });

  it("keeps every ticked value enabled, so the shopper can always untick", async () => {
    stubFacets([manyFacet]);
    const onFilterChange = jest.fn();

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{ specs: twentySelected }}
        onFilterChange={onFilterChange}
      />,
    );

    const ticked = await screen.findByRole("checkbox", {
      name: control("V20"),
    });
    expect(ticked).toBeEnabled();
    await userEvent.click(ticked);
    expect(onFilterChange).toHaveBeenCalledWith({
      specs: `material:${twentyOne.slice(0, 19).join(",")}`,
    });
  });

  it("shows no note and no disabled control below the caps", async () => {
    stubFacets([materialFacet]);

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{ specs: "material:Силікон" }}
        onFilterChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByRole("checkbox", { name: control("Шкіра") }),
    ).toBeEnabled();
    expect(
      screen.queryByText(dict.filters.specLimitReached),
    ).not.toBeInTheDocument();
  });

  it("disables a value whose tick would push ?specs= past 600 characters", async () => {
    // Two long values already selected leave no room for a third.
    const long = (n: number) => `${"Д".repeat(290)}${n}`;
    stubFacets([facet("material", "Матеріал", [long(1), long(2), long(3)])]);

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{ specs: `material:${long(1)},${long(2)}` }}
        onFilterChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByRole("checkbox", { name: control(long(3)) }),
    ).toBeDisabled();
  });

  it("disables an unticked colour past the caps too", async () => {
    const colours = Array.from({ length: 21 }, (_, i) => `Колір${i + 1}`);
    stubFacets([facet("color", "Колір", colours)]);

    renderWithProviders(
      <SpecFacets
        categoryId={CATEGORY_ID}
        currentParams={{ specs: `color:${colours.slice(0, 20).join(",")}` }}
        onFilterChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByRole("checkbox", { name: control("Колір21") }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: control("Колір1") }),
    ).toBeEnabled();
  });
});
