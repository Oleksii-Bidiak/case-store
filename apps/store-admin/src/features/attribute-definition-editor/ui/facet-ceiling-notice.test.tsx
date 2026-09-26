import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { FacetCeilingNotice } from "./facet-ceiling-notice";

const d = dict.attributeDefinitions;
const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";

function stubReport(status: number, body: Record<string, unknown>) {
  server.use(
    http.get("*/api/categories/:id/facet-ceiling", () =>
      HttpResponse.json(body, { status }),
    ),
  );
}

describe("FacetCeilingNotice (TASK-707)", () => {
  it("names every category over the ceiling and the facets it loses", async () => {
    stubReport(200, {
      data: {
        limit: 6,
        categories: [
          {
            categoryId: "c1",
            categoryName: "Зарядки",
            facetCount: 8,
            overflowLabels: ["Комплектація", "Довжина кабелю"],
          },
        ],
      },
    });

    renderWithProviders(<FacetCeilingNotice categoryId={CATEGORY_ID} />);

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(d.facetCeilingTitle(6));
    expect(notice).toHaveTextContent(
      d.facetCeilingCategory("Зарядки", 8, ["Комплектація", "Довжина кабелю"]),
    );
  });

  it("renders nothing while every category is within the ceiling", async () => {
    let served = false;
    server.use(
      http.get("*/api/categories/:id/facet-ceiling", () => {
        served = true;
        return HttpResponse.json({ data: { limit: 6, categories: [] } });
      }),
    );

    const { container } = renderWithProviders(
      <FacetCeilingNotice categoryId={CATEGORY_ID} />,
    );

    await waitFor(() => expect(served).toBe(true));
    // One more macrotask so the response has been rendered, not just served.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("says the check failed instead of implying there is nothing to fix", async () => {
    stubReport(500, { message: "boom" });

    renderWithProviders(<FacetCeilingNotice categoryId={CATEGORY_ID} />);

    expect(
      await screen.findByText(d.facetCeilingLoadError),
    ).toBeInTheDocument();
  });
});
