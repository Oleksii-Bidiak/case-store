import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { CategoryAddonTemplatePicker } from "./category-addon-template-picker";

const d = dict.categories.addonTemplate;

const services = [
  {
    id: "svc-warranty",
    name: "Гарантія",
    description: null,
    price: "499.00",
    isActive: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "svc-insurance",
    name: "Страхування",
    description: null,
    price: "899.00",
    isActive: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
];

/**
 * Arrange the three reads the picker makes: the active catalog, the category's
 * OWN template (the checkbox state), and the RESOLVED template (the inheritance
 * note).
 */
function arrange(options: {
  ownIds?: string[];
  source?: "own" | "inherited" | "none";
  sourceCategoryName?: string | null;
}) {
  const { ownIds = [], source = "none", sourceCategoryName = null } = options;

  server.use(
    http.get("*/api/addon-services/admin/active", () =>
      HttpResponse.json({ data: services }),
    ),
    http.get("*/api/addon-services/templates/category/:categoryId", () =>
      HttpResponse.json({ data: { addonServiceIds: ownIds } }),
    ),
    http.get(
      "*/api/addon-services/templates/category/:categoryId/resolved",
      () =>
        HttpResponse.json({
          data: {
            source,
            sourceCategoryId: sourceCategoryName ? "cat-root" : null,
            sourceCategoryName,
            addons: [],
          },
        }),
    ),
  );
}

describe("CategoryAddonTemplatePicker (TASK-174)", () => {
  it("lists the active catalog services with their prices", async () => {
    arrange({});

    renderWithProviders(<CategoryAddonTemplatePicker categoryId="cat-1" />);

    expect(await screen.findByLabelText("Гарантія")).toBeInTheDocument();
    expect(screen.getByLabelText("Страхування")).toBeInTheDocument();
    expect(screen.getByText("499.00")).toBeInTheDocument();
  });

  it("seeds the checkboxes from the category's OWN template", async () => {
    arrange({ ownIds: ["svc-insurance"], source: "own" });

    renderWithProviders(<CategoryAddonTemplatePicker categoryId="cat-1" />);

    await waitFor(() =>
      expect(screen.getByLabelText("Страхування")).toBeChecked(),
    );
    expect(screen.getByLabelText("Гарантія")).not.toBeChecked();
  });

  it("shows the inheritance note when the category has no own template", async () => {
    arrange({ source: "inherited", sourceCategoryName: "Смартфони" });

    renderWithProviders(<CategoryAddonTemplatePicker categoryId="cat-1" />);

    expect(
      await screen.findByText(d.inheritedFrom("Смартфони")),
    ).toBeInTheDocument();
  });

  it("shows the 'nobody in the chain offers anything' note", async () => {
    arrange({ source: "none" });

    renderWithProviders(<CategoryAddonTemplatePicker categoryId="cat-1" />);

    expect(await screen.findByText(d.noneAnywhere)).toBeInTheDocument();
  });

  it("PATCHes the full replacement set when saving", async () => {
    arrange({ ownIds: ["svc-warranty"], source: "own" });
    let body: { addonServiceIds?: string[] } | null = null;
    server.use(
      http.patch(
        "*/api/addon-services/templates/category/:categoryId",
        async ({ request }) => {
          body = (await request.json()) as { addonServiceIds?: string[] };
          return HttpResponse.json({ data: { addonServiceIds: [] } });
        },
      ),
    );

    renderWithProviders(<CategoryAddonTemplatePicker categoryId="cat-1" />);

    await waitFor(() =>
      expect(screen.getByLabelText("Гарантія")).toBeChecked(),
    );
    await userEvent.click(screen.getByLabelText("Страхування"));
    await userEvent.click(screen.getByRole("button", { name: d.save }));

    await waitFor(() =>
      expect(body).toEqual({
        addonServiceIds: ["svc-warranty", "svc-insurance"],
      }),
    );
  });

  it("saving with nothing checked clears the own template (empty array is a real payload)", async () => {
    arrange({ ownIds: ["svc-warranty"], source: "own" });
    let body: { addonServiceIds?: string[] } | null = null;
    server.use(
      http.patch(
        "*/api/addon-services/templates/category/:categoryId",
        async ({ request }) => {
          body = (await request.json()) as { addonServiceIds?: string[] };
          return HttpResponse.json({ data: { addonServiceIds: [] } });
        },
      ),
    );

    renderWithProviders(<CategoryAddonTemplatePicker categoryId="cat-1" />);

    await waitFor(() =>
      expect(screen.getByLabelText("Гарантія")).toBeChecked(),
    );
    await userEvent.click(screen.getByLabelText("Гарантія"));

    expect(await screen.findByText(d.clearedNote)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: d.save }));

    await waitFor(() => expect(body).toEqual({ addonServiceIds: [] }));
  });
});
