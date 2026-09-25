import { renderHook } from "@testing-library/react";
import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { CatalogImportPlan } from "../model/plan-types";
import { useImportDecisions } from "../model/use-import-decisions";
import { ImportPlanReview } from "./import-plan-review";

function makePlan(): CatalogImportPlan {
  return {
    rows: [],
    categories: [],
    brands: [],
    deviceBrands: [],
    deviceModels: [],
    attributeColumns: [{ key: "material", label: "Матеріал", filledCount: 3 }],
    groups: [],
    issues: [],
    counts: {
      total: 0,
      create: 0,
      update: 0,
      unchanged: 0,
      missing: 0,
      conflicts: 0,
      errors: 0,
    },
  };
}

describe("ImportPlanReview — reference hint (TASK-727)", () => {
  // The import creates characteristics as «Текст», and a «Текст» characteristic
  // can never be a filter (TASK-488). The hint used to promise «зробити їх
  // фільтрами можна пізніше» without saying the type has to change first.
  it("tells the operator to change the type before making a characteristic a filter", () => {
    const { result } = renderHook(() => useImportDecisions());

    renderWithProviders(
      <ImportPlanReview plan={makePlan()} decisions={result.current} />,
    );

    const hint = screen.getByText(dict.catalogImport.refHint);
    const a = dict.attributeDefinitions;
    expect(hint).toHaveTextContent(`«${a.typeText}»`);
    expect(hint).toHaveTextContent(`«${a.typeSelect}»`);
    expect(hint).toHaveTextContent(`«${a.typeBoolean}»`);
    expect(hint).toHaveTextContent(`«${a.isFilterable}»`);
    // The path names the real sidebar item and the section heading of the
    // category card where the characteristic templates live.
    expect(hint).toHaveTextContent(`«${dict.nav.categories}»`);
    expect(hint).toHaveTextContent(`«${a.heading}»`);
  });
});
